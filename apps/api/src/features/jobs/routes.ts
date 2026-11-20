import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "../../db/tenant-transaction.js";
import { HttpError } from "../../http-error.js";
import type { Session } from "../auth/contracts.js";
import { authorize } from "../auth/authorize.js";
import { advanceJobSchema, cancelJobSchema, createJobSchema, editJobSchema, scheduleJobSchema, scheduleQuery } from "./contracts.js";
import { emergencyDemoJob, pipeDemoJob } from "./demo-fixtures.js";
import { advanceJob, cancelJob, createJob, editJob, scheduleJob } from "./mutations.js";
import { findJob, getScheduleDay, getTechnicians, listJobEvents, listJobs } from "./queries.js";

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? "Invalid request");
  return result.data;
}

export function jobRoutes(pool: Pool, sessionKey: Uint8Array, demoMode: boolean) {
  const router = Router();
  const jobIdSchema = z.uuid();

  const authorized = authorize(pool, sessionKey);
  const dispatchRoles: Session["role"][] = ["ADMIN", "DISPATCHER"];

  router.get("/dispatch", authorized(async (request, response, session) => {
    const { date } = validate(scheduleQuery, request.query);
    const snapshot = await withTenant(pool, session, async (client) => {
      const day = await getScheduleDay(client, session.tenantId, date);
      const technicians = await getTechnicians(client, session.tenantId);
      const jobs = await listJobs(client, session.tenantId, day.date, true);
      return { ...day, technicians, jobs, demoMode };
    });
    response.json(snapshot);
  }, dispatchRoles));

  router.get("/tech/route", authorized(async (request, response, session) => {
    const { date } = validate(scheduleQuery, request.query);
    const route = await withTenant(pool, session, async (client) => {
      const day = await getScheduleDay(client, session.tenantId, date);
      const jobs = await listJobs(client, session.tenantId, day.date);
      return { ...day, jobs };
    });
    response.json(route);
  }, ["TECHNICIAN"]));

  router.get("/jobs", authorized(async (_request, response, session) => {
    const jobs = await withTenant(pool, session, (client) => listJobs(client, session.tenantId));
    response.json({ jobs });
  }, dispatchRoles));

  router.post("/jobs", authorized(async (request, response, session) => {
    const input = validate(createJobSchema, request.body);
    const job = await withTenant(pool, session, (client) => createJob(client, session, input));
    response.status(201).json(job);
  }, dispatchRoles));

  router.post("/jobs/emergency-demo", authorized(async (_request, response, session) => {
    if (!demoMode) throw new HttpError(404, "The preset emergency call is unavailable");
    const input = session.tenantSlug === "metro-plumbing"
      ? { ...pipeDemoJob, title: "Urgent water leak", notes: "A supply connection is leaking near the service valve." }
      : emergencyDemoJob;
    const job = await withTenant(pool, session, (client) => createJob(client, session, input));
    response.status(201).json(job);
  }, dispatchRoles));

  router.get("/jobs/:id", authorized(async (request, response, session) => {
    const id = validate(jobIdSchema, request.params.id);
    const detail = await withTenant(pool, session, async (client) => {
      const job = await findJob(client, session.tenantId, id);
      if (!job) throw new HttpError(404, "Work order not found");
      const events = await listJobEvents(client, session.tenantId, job);
      const { timeZone } = await getScheduleDay(client, session.tenantId, undefined);
      return { job, events, timeZone };
    });
    response.json(detail);
  }));

  router.patch("/jobs/:id", authorized(async (request, response, session) => {
    const id = validate(jobIdSchema, request.params.id);
    const input = validate(editJobSchema, request.body);
    await withTenant(pool, session, (client) => editJob(client, session, id, input));
    response.sendStatus(204);
  }, dispatchRoles));

  router.post("/jobs/:id/cancel", authorized(async (request, response, session) => {
    const id = validate(jobIdSchema, request.params.id);
    const input = validate(cancelJobSchema, request.body);
    await withTenant(pool, session, (client) => cancelJob(client, session, id, input));
    response.sendStatus(204);
  }, dispatchRoles));

  router.put("/jobs/:id/schedule", authorized(async (request, response, session) => {
    const input = validate(scheduleJobSchema, request.body);
    const id = validate(jobIdSchema, request.params.id);
    await withTenant(pool, session, (client) => scheduleJob(client, session, id, input));
    response.sendStatus(204);
  }, dispatchRoles));

  router.patch("/jobs/:id/status", authorized(async (request, response, session) => {
    const input = validate(advanceJobSchema, request.body);
    const id = validate(jobIdSchema, request.params.id);
    await withTenant(pool, session, (client) => advanceJob(client, session, id, input));
    response.sendStatus(204);
  }, ["TECHNICIAN"]));

  return router;
}
