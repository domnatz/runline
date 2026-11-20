import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "../../db/tenant-transaction.js";
import { HttpError } from "../../http-error.js";
import { authorize } from "../auth/authorize.js";
import { daySchema, scheduleJobSchema } from "../jobs/contracts.js";
import { matchTechnicians, readNeighbors, travelWarnings } from "./planning.js";

const idSchema = z.uuid();
const matchWindow = z.strictObject({
  date: daySchema, startMinute: z.coerce.number().int().min(420).max(1125).multipleOf(15),
  durationMinutes: z.coerce.number().int().min(15).max(720).multipleOf(15),
}).refine(({ startMinute, durationMinutes }) => startMinute + durationMinutes <= 1140);

export function planningRoutes(pool: Pool, sessionKey: Uint8Array, demoMode: boolean) {
  const router = Router();
  const authorized = authorize(pool, sessionKey);

  router.get("/dispatch/jobs/:id/matches", authorized(async (request, response, session) => {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) throw new HttpError(404, "Work order not found");
    const window = Object.keys(request.query).length ? matchWindow.safeParse(request.query) : undefined;
    if (window && !window.success) throw new HttpError(400, "Choose a valid appointment time");
    const appointment = window?.data ? { ...window.data, serviceDate: window.data.date } : undefined;
    response.json(await withTenant(pool, session, (client) => matchTechnicians(client, session.tenantId, id.data, appointment), true));
  }, ["ADMIN", "DISPATCHER"]));

  router.post("/dispatch/jobs/:id/drive-time", authorized(async (request, response, session) => {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) throw new HttpError(404, "Work order not found");
    const input = scheduleJobSchema.safeParse(request.body);
    if (!input.success) throw new HttpError(400, "Enter a technician and valid appointment times to check drive time");
    const neighbors = await withTenant(pool, session, (client) => readNeighbors(client, session.tenantId, id.data, input.data), true);
    response.json({ legs: await travelWarnings(neighbors) });
  }, ["ADMIN", "DISPATCHER"]));

  router.get("/demo/notifications", authorized(async (_request, response, session) => {
    const notifications = demoMode ? await withTenant(pool, session, async (client) => {
      const { rows } = await client.query(`
        SELECT n.work_order_id AS "jobId", j.title, n.version, n.kind, n.delivery_status AS "deliveryStatus",
          n.created_at AS "createdAt"
        FROM runline.notifications n
        JOIN runline.work_orders j ON j.tenant_id = n.tenant_id AND j.id = n.work_order_id
        WHERE n.tenant_id = $1 ORDER BY n.created_at DESC, n.work_order_id, n.version DESC LIMIT 50
      `, [session.tenantId]);
      return rows;
    }, true) : [];
    response.json({ enabled: demoMode, notifications });
  }, ["ADMIN"]));

  return router;
}
