import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "../../db/tenant-transaction.js";
import { HttpError } from "../../http-error.js";
import type { RealtimeEvents } from "../../realtime/events.js";
import { streamSnapshot } from "../../realtime/stream.js";
import { authorize } from "../auth/authorize.js";
import type { Session } from "../auth/contracts.js";
import { scheduleQuery } from "../jobs/contracts.js";
import { idempotencyKey, syncBatch } from "./contracts.js";
import { fieldManifest, inventoryOverview } from "./queries.js";
import { syncFieldBatch } from "./sync.js";

export const fieldQuery = scheduleQuery.extend({ jobId: z.uuid().optional() });

export function fieldRoutes(pool: Pool, sessionKey: Uint8Array, events: RealtimeEvents) {
  const router = Router();
  const authorized = authorize(pool, sessionKey);
  const datasetId = process.env.RUNLINE_DATASET_ID || undefined;

  router.get("/tech/manifest", authorized(async (request, response, session) => {
    const query = fieldQuery.safeParse(request.query);
    if (!query.success) throw new HttpError(400, "Choose a valid route date or work order");
    const { date, jobId } = query.data;
    const manifest = await withTenant(pool, session, (client) => fieldManifest(client, session, date, jobId), true);
    response.json({ ...manifest, profile: { ...manifest.profile, datasetId } });
  }, ["TECHNICIAN"]));

  router.post("/sync/batch", authorized(async (request, response, session) => {
    const key = idempotencyKey.safeParse(request.get("Idempotency-Key"));
    const batch = syncBatch.safeParse(request.body);
    if (!key.success || !batch.success) throw new HttpError(400, "Provide a valid idempotency key and offline batch");
    const { data } = batch;
    if (data.tenantId !== session.tenantId || data.userId !== session.userId) {
      throw new HttpError(403, "Sign in as the technician who recorded these changes");
    }
    if (data.datasetId !== datasetId) throw new HttpError(403, "Sign in to the current workspace to sync work");
    const outcomes = await withTenant(pool, session, (client) => syncFieldBatch(client, session, key.data, data));
    response.json({ outcomes });
  }, ["TECHNICIAN"]));

  async function readStock(session: Session) {
    const stock = await withTenant(pool, session, (client) => inventoryOverview(client, session.tenantId), true);
    return { stock };
  }

  router.get("/inventory", authorized(async (_request, response, session) => {
    response.json(await readStock(session));
  }, ["ADMIN", "DISPATCHER"]));

  router.get("/inventory/stream", authorized(async (_request, response, session) => {
    streamSnapshot(response, events, { ...session, channel: "runline_inventory" }, () => readStock(session));
  }, ["ADMIN", "DISPATCHER"]));

  return router;
}
