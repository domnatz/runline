import { Router } from "express";
import type { Pool } from "pg";
import { demoLoginSchema, sessionSchema } from "./contracts.js";
import { demoTenants } from "./demo-fixtures.js";
import { findSession, readSession, sessionCookie, sessionLifetime, signSession } from "./session.js";

type SessionOptions = {
  demoMode: boolean;
  secureCookies: boolean;
  sessionKey: Uint8Array;
};

export function sessionRoutes(pool: Pool, options: SessionOptions) {
  const router = Router();
  const cookieOptions = {
    httpOnly: true,
    secure: options.secureCookies,
    sameSite: "lax" as const,
    path: "/",
  };

  router.get("/demo/tenants", (_request, response) => {
    const tenants = options.demoMode ? demoTenants.map(({ slug, name }) => ({ slug, name })) : [];
    response.json({ tenants });
  });

  router.post("/demo/session", async (request, response) => {
    if (!options.demoMode) {
      response.status(404).json({ error: "Sign-in is disabled" });
      return;
    }

    const body = demoLoginSchema.safeParse(request.body);
    if (!body.success) {
      response.status(400).json({ error: "Choose a valid organization and role" });
      return;
    }

    const tenant = demoTenants.find(({ slug }) => slug === body.data.tenantSlug);
    if (!tenant) {
      response.status(404).json({ error: "Unknown organization" });
      return;
    }

    const { persona } = body.data;
    const session = await findSession(pool, tenant.id, tenant.accounts[persona].id);
    if (session?.role !== persona) {
      response.status(503).json({ error: "Account is unavailable" });
      return;
    }

    const token = await signSession(session, options.sessionKey);

    response.cookie(sessionCookie, token, { ...cookieOptions, maxAge: sessionLifetime * 1000 });
    response.sendStatus(204);
  });

  router.get("/session", async (request, response) => {
    const session = await readSession(pool, options.sessionKey, request.get("cookie"));
    if (!session) {
      response.status(401).json({ error: "Sign in to open the workspace" });
      return;
    }

    response.json(sessionSchema.parse(session));
  });

  router.delete("/session", (_request, response) => {
    response.clearCookie(sessionCookie, cookieOptions);
    response.sendStatus(204);
  });

  return router;
}
