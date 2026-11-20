import type { PoolClient } from "pg";
import { HttpError } from "../../http-error.js";
import type { Session } from "../auth/contracts.js";
import { findJob, getScheduleDay, listFieldEvents, listJobs } from "../jobs/queries.js";
import type { ChecklistKey } from "./contracts.js";

type Stock = { sku: string; name: string; quantity: number };
type UsedPart = Stock & { id: string; jobId: string };

const selectStock = `
  FROM runline.inventory_stock s
  JOIN runline.inventory_parts p ON p.tenant_id = s.tenant_id AND p.sku = s.sku
  JOIN runline.inventory_locations l ON l.tenant_id = s.tenant_id AND l.id = s.location_id
`;

export async function inventoryOverview(client: PoolClient, tenantId: string) {
  const { rows } = await client.query<Stock & { locationId: string; locationName: string }>(`
    SELECT s.sku, p.name, s.quantity, l.id AS "locationId", l.name AS "locationName"
    ${selectStock} WHERE s.tenant_id = $1 ORDER BY p.name, l.kind DESC, l.name
  `, [tenantId]);
  return rows;
}

export async function fieldManifest(client: PoolClient, session: Session, date?: string, jobId?: string) {
  const { tenantId, userId, tenantName, userName } = session;
  const selected = jobId ? await findJob(client, tenantId, jobId) : undefined;
  if (jobId && !selected?.serviceDate) throw new HttpError(404, "Work order not found");
  const day = await getScheduleDay(client, tenantId, selected?.serviceDate ?? date);
  const jobs = await listJobs(client, tenantId, day.date);
  const jobIds = jobs.map(({ id }) => id);
  const stock = await client.query<Stock>(`
    SELECT s.sku, p.name, s.quantity ${selectStock}
    WHERE s.tenant_id = $1 AND l.technician_id = $2 ORDER BY p.name
  `, [tenantId, userId]);
  const checklist = await client.query<{ jobId: string; item: ChecklistKey; checked: boolean }>(`
    SELECT work_order_id AS "jobId", item_key AS item, checked FROM runline.job_checklist
    WHERE tenant_id = $1 AND work_order_id = ANY($2::uuid[])
  `, [tenantId, jobIds]);
  const parts = await client.query<UsedPart>(`
    SELECT u.work_order_id AS "jobId", u.mutation_id AS id, u.sku, p.name, u.quantity
    FROM runline.job_parts u JOIN runline.inventory_parts p ON p.tenant_id = u.tenant_id AND p.sku = u.sku
    WHERE u.tenant_id = $1 AND u.work_order_id = ANY($2::uuid[]) ORDER BY u.recorded_at, u.mutation_id
  `, [tenantId, jobIds]);
  const events = await listFieldEvents(client, tenantId, jobIds);

  return {
    ...day, profile: { tenantId, userId, tenantName, userName }, stock: stock.rows,
    jobs: jobs.map((job) => ({
      job, events: events.flatMap(({ jobId, ...event }) => jobId === job.id ? [event] : []),
      checklist: Object.fromEntries(checklist.rows.filter((row) => row.jobId === job.id).map(({ item, checked }) => [item, checked])),
      parts: parts.rows.flatMap(({ jobId, ...part }) => jobId === job.id ? [part] : []),
    })),
  };
}
