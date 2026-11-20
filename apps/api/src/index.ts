import { randomBytes } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import pg from "pg";
import { sessionRoutes } from "./features/auth/routes.js";
import { billingRoutes } from "./features/billing/routes.js";
import { planningRoutes } from "./features/dispatch/routes.js";
import { fieldRoutes } from "./features/field/routes.js";
import { jobRoutes } from "./features/jobs/routes.js";
import { trackingRoutes } from "./features/tracking/routes.js";
import { HttpError } from "./http-error.js";
import { openapi } from "./openapi.js";
import { createRealtimeEvents } from "./realtime/events.js";

const port = Number(process.env.RUNLINE_API_PORT ?? "4000");
const host = process.env.RUNLINE_API_HOST ?? "127.0.0.1";
const configuredSecret = process.env.RUNLINE_SESSION_SECRET;
if (configuredSecret && Buffer.byteLength(configuredSecret) < 32) {
  throw new Error("RUNLINE_SESSION_SECRET must contain at least 32 bytes");
}
const demoMode = process.env.RUNLINE_DEMO_MODE === "true";
if (!configuredSecret && !demoMode) throw new Error("RUNLINE_SESSION_SECRET is required when seeded access is disabled");

const pool = new pg.Pool({ user: "runline_app", max: 5, connectionTimeoutMillis: 3000 });
pool.on("error", (error) => console.error("Idle database connection failed", error));
const sessionKey = configuredSecret ? Buffer.from(configuredSecret) : randomBytes(32);
const realtimeEvents = createRealtimeEvents();

const app = express();
app.disable("x-powered-by");
app.use("/api", (_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
app.use("/api", express.json({ limit: "8kb" }));

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT postgis_lib_version()");
    response.json({ status: "ok" });
  } catch (error) {
    console.error("Database readiness check failed", error);
    response.status(503).json({ error: "Database unavailable" });
  }
});

app.get("/api/openapi.json", (_request, response) => response.json(openapi));
app.use("/api", sessionRoutes(pool, {
  demoMode,
  secureCookies: process.env.RUNLINE_SECURE_COOKIE === "true",
  sessionKey,
}));
app.use("/api", jobRoutes(pool, sessionKey, demoMode));
app.use("/api", fieldRoutes(pool, sessionKey, realtimeEvents));
app.use("/api", billingRoutes(pool, sessionKey, demoMode));
app.use("/api", trackingRoutes(pool, sessionKey, realtimeEvents, demoMode));
app.use("/api", planningRoutes(pool, sessionKey, demoMode));

app.use((_request, response) => response.status(404).json({ error: "Route not found" }));

app.use((error: Error & { status?: number }, _request: Request, response: Response, next: NextFunction) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  if (error.status === 400 || error.status === 413 || error.status === 415) {
    response.status(error.status).json({ error: "Invalid request body" });
    return;
  }

  console.error("Request failed", error);
  response.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, host, () => console.info(`Runline API listening on ${host}:${port}`));

function shutdown() {
  realtimeEvents.close();
  server.close(() => {
    void pool.end().catch((error: unknown) => {
      console.error("Failed to close database pool", error);
      process.exitCode = 1;
    });
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
