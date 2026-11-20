import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "../../db/tenant-transaction.js";
import { HttpError } from "../../http-error.js";
import type { RealtimeEvents } from "../../realtime/events.js";
import { streamSnapshot } from "../../realtime/stream.js";
import { authorize } from "../auth/authorize.js";
import { createCustomerLink, customerScope } from "../billing/customer-link.js";
import { scheduleQuery } from "../jobs/contracts.js";
import { findJob, getScheduleDay } from "../jobs/queries.js";
import { demoPing, locationPing } from "./contracts.js";
import { canReplay, recordLocation, stopLocation } from "./location.js";
import { customerTracking, dispatchTracking, routeTrip } from "./queries.js";

const uuidSchema = z.uuid();

function parseJobId(value: unknown) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new HttpError(404, "Work order not found");
  return parsed.data;
}

export function trackingRoutes(pool: Pool, key: Uint8Array, events: RealtimeEvents, demoMode: boolean) {
  const router = Router();
  const authorized = authorize(pool, key);

  router.post("/tracking/jobs/:id/link", authorized(async (request, response, session) => {
    const { tenantId } = session;
    const jobId = parseJobId(request.params.id);
    const job = await withTenant(pool, session, (client) => findJob(client, tenantId, jobId), true);
    if (!job) throw new HttpError(404, "Work order not found");
    response.json(await createCustomerLink({ tenantId, jobId }, key));
  }, ["ADMIN", "DISPATCHER"]));

  router.get("/tracking/dispatch/stream", authorized(async (request, response, session) => {
    const query = scheduleQuery.safeParse(request.query);
    if (!query.success) throw new HttpError(400, "Choose a valid dispatch date");
    const { tenantId } = session;
    const date = query.data.date ?? (await withTenant(pool, session, (client) =>
      getScheduleDay(client, tenantId, undefined), true)).date;
    streamSnapshot(response, events, { ...session, channel: "runline_tracking" }, async () => {
      const snapshot = await withTenant(pool, session, (client) => dispatchTracking(client, tenantId, date), true);
      return { jobs: snapshot.jobs, trips: await Promise.all(snapshot.trips.map(routeTrip)) };
    });
  }, ["ADMIN", "DISPATCHER"]));

  router.get("/tracking/tech/jobs/:id", authorized(async (request, response, session) => {
    const jobId = parseJobId(request.params.id);
    response.json({ demoReplay: await withTenant(pool, session, (client) => canReplay(client, session, jobId, demoMode), true) });
  }, ["TECHNICIAN"]));

  router.post("/tracking/tech/jobs/:id/location", authorized(async (request, response, session) => {
    const jobId = parseJobId(request.params.id);
    const ping = locationPing.safeParse(request.body);
    if (!ping.success) throw new HttpError(400, "Send valid coordinates, accuracy, and capture time");
    response.json(await withTenant(pool, session, (client) => recordLocation(client, session, jobId, ping.data)));
  }, ["TECHNICIAN"]));

  router.post("/tracking/tech/jobs/:id/replay", authorized(async (request, response, session) => {
    if (!demoMode) throw new HttpError(404, "Route replay is unavailable");
    const jobId = parseJobId(request.params.id);
    const ping = demoPing.safeParse(request.body);
    if (!ping.success) throw new HttpError(400, "Choose a valid replay step");
    response.json(await withTenant(pool, session, (client) => recordLocation(client, session, jobId, ping.data)));
  }, ["TECHNICIAN"]));

  router.delete("/tracking/tech/jobs/:id/location", authorized(async (request, response, session) => {
    const jobId = parseJobId(request.params.id);
    await withTenant(pool, session, (client) => stopLocation(client, session, jobId));
    response.sendStatus(204);
  }, ["TECHNICIAN"]));

  router.use("/tracking/customer", (_request, response, next) => {
    response.set({ "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" });
    next();
  });

  async function readCustomer(token: unknown) {
    const signed = await customerScope(token, key);
    if (!signed.jobId) throw new HttpError(404, "This link has no live tracking");
    const scope = { tenantId: signed.tenantId, jobId: signed.jobId, role: signed.role, expiresAt: signed.exp * 1000 };
    const read = async () => {
      const job = await withTenant(pool, scope, (client) => customerTracking(client, scope), true);
      return job ? { ...job, trip: job.trip ? await routeTrip(job.trip) : null } : null;
    };
    const job = await read();
    if (!job) throw new HttpError(404, "Work order not found");
    return { scope, job, read };
  }

  router.get("/tracking/customer/:token", async (request, response) => {
    const { job } = await readCustomer(request.params.token);
    response.json(job);
  });

  router.get("/tracking/customer/:token/stream", async (request, response) => {
    const { scope, read } = await readCustomer(request.params.token);
    streamSnapshot(response, events, { ...scope, channel: "runline_tracking" }, read);
  });

  return router;
}
