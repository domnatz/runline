import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpError } from "../../http-error.js";
import type { Session } from "../auth/contracts.js";
import { advanceJob } from "../jobs/mutations.js";
import type { FieldMutation, MutationOutcome, SyncBatch } from "./contracts.js";

function fingerprint(value: FieldMutation | SyncBatch) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function applyMutation(client: PoolClient, session: Session, mutation: FieldMutation): Promise<MutationOutcome> {
  const { tenantId, userId } = session;
  const { id, jobId } = mutation;

  if (mutation.type === "status") {
    await advanceJob(client, session, jobId, mutation);
    return { id, state: "applied" };
  }

  const { rows: [job] } = await client.query<{ status: string }>(`
    SELECT status FROM runline.work_orders WHERE tenant_id = $1 AND id = $2 AND technician_id = $3 FOR UPDATE
  `, [tenantId, jobId, userId]);
  if (!job) throw new HttpError(404, "This work order is no longer assigned to you.");
  if (job.status !== "ARRIVED") throw new HttpError(409, "Mark arrival before updating the checklist or using parts.");

  if (mutation.type === "checklist") {
    await client.query(`
      INSERT INTO runline.job_checklist (tenant_id, work_order_id, item_key, checked) VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, work_order_id, item_key) DO UPDATE SET checked = EXCLUDED.checked
    `, [tenantId, jobId, mutation.item, mutation.checked]);
    return { id, state: "applied" };
  }

  const stockKey = [tenantId, userId, mutation.sku];
  const { rows: [used] } = await client.query<{ quantity: number; location_id: string }>(`
    UPDATE runline.inventory_stock AS stock SET quantity = stock.quantity - $4
    FROM runline.inventory_locations van
    WHERE stock.tenant_id = $1 AND van.tenant_id = stock.tenant_id AND van.id = stock.location_id
      AND van.technician_id = $2 AND stock.sku = $3 AND stock.quantity >= $4
    RETURNING stock.quantity, stock.location_id
  `, [...stockKey, mutation.quantity]);
  if (!used) {
    const { rows: [stock] } = await client.query<{ quantity: number }>(`
      SELECT s.quantity FROM runline.inventory_stock s JOIN runline.inventory_locations l
        ON l.tenant_id = s.tenant_id AND l.id = s.location_id
      WHERE s.tenant_id = $1 AND l.technician_id = $2 AND s.sku = $3
    `, stockKey);
    const remaining = stock?.quantity ?? 0;
    return { id, state: "rejected", remaining, message: `Van stock changed. ${remaining} available for ${mutation.sku}.` };
  }

  await client.query(`
    INSERT INTO runline.job_parts (tenant_id, work_order_id, technician_id, mutation_id, location_id, sku, quantity)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [tenantId, jobId, userId, id, used.location_id, mutation.sku, mutation.quantity]);
  await client.query("SELECT pg_notify('runline_inventory', $1)", [tenantId]);
  return { id, state: "applied", remaining: used.quantity };
}

export async function syncFieldBatch(client: PoolClient, session: Session, key: string, batch: SyncBatch) {
  const scope = [session.tenantId, session.userId];
  const batchHash = fingerprint(batch);

  // serialize this technician's batches before looking up or writing receipts.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`field:${scope.join(":")}`]);
  const { rows: [previousBatch] } = await client.query<{ request_hash: string; outcome: MutationOutcome[] }>(`
    SELECT request_hash, outcome FROM runline.sync_batches WHERE tenant_id = $1 AND technician_id = $2 AND key = $3
  `, [...scope, key]);
  if (previousBatch) {
    if (previousBatch.request_hash !== batchHash) throw new HttpError(409, "This idempotency key was used for another batch.");
    return previousBatch.outcome;
  }

  const outcomes: MutationOutcome[] = [];
  for (const mutation of batch.mutations) {
    const last = outcomes.at(-1);
    if (last && last.state !== "applied") {
      outcomes.push({ id: mutation.id, state: "blocked" });
      continue;
    }
    const hash = fingerprint(mutation);
    const { rows: [previous] } = await client.query<{ request_hash: string; outcome: MutationOutcome }>(`
      SELECT request_hash, outcome FROM runline.sync_mutations WHERE tenant_id = $1 AND technician_id = $2 AND id = $3
    `, [...scope, mutation.id]);
    if (previous) {
      outcomes.push(previous.request_hash === hash ? previous.outcome : {
        id: mutation.id, state: "rejected", message: "This update ID belongs to a different change.",
      });
      continue;
    }

    await client.query("SAVEPOINT field_change");
    let outcome: MutationOutcome;
    try {
      outcome = await applyMutation(client, session, mutation);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      await client.query("ROLLBACK TO SAVEPOINT field_change");
      outcome = { id: mutation.id, state: "rejected", message: error.message };
    }
    await client.query("RELEASE SAVEPOINT field_change");
    await client.query(`
      INSERT INTO runline.sync_mutations (tenant_id, technician_id, id, request_hash, outcome) VALUES ($1, $2, $3, $4, $5)
    `, [...scope, mutation.id, hash, JSON.stringify(outcome)]);
    outcomes.push(outcome);
  }

  await client.query(`
    INSERT INTO runline.sync_batches (tenant_id, technician_id, key, request_hash, outcome) VALUES ($1, $2, $3, $4, $5)
  `, [...scope, key, batchHash, JSON.stringify(outcomes)]);
  return outcomes;
}
