import type { PoolClient } from "pg";
import type { Job, JobEvent } from "./contracts.js";

const selectJobs = `
  SELECT j.id, j.title, j.customer_name AS "customerName", j.address, j.notes, j.priority, j.status,
         j.technician_id AS "technicianId", technician.name AS "technicianName",
         j.service_date::text AS "serviceDate", j.start_minute AS "startMinute",
         j.duration_minutes AS "durationMinutes", j.version, j.created_at AS "createdAt",
         j.required_skills AS "requiredSkills",
         CASE WHEN j.destination IS NOT NULL THEN jsonb_build_object(
           'longitude', ST_X(j.destination::geometry), 'latitude', ST_Y(j.destination::geometry)
         ) END AS destination
  FROM runline.work_orders j
  LEFT JOIN runline.tenant_members technician
    ON technician.tenant_id = j.tenant_id AND technician.id = j.technician_id
`;

export async function getScheduleDay(client: PoolClient, tenantId: string, date: string | undefined) {
  const { rows: [tenant] } = await client.query<{ timeZone: string; today: string }>(`
    SELECT time_zone AS "timeZone", (now() AT TIME ZONE time_zone)::date::text AS today
    FROM runline.tenants WHERE id = $1
  `, [tenantId]);
  if (!tenant) throw new Error("Tenant scheduling configuration is unavailable");
  return { ...tenant, date: date ?? tenant.today };
}

export async function getTechnicians(client: PoolClient, tenantId: string) {
  const { rows } = await client.query<{ id: string; name: string }>(`
    SELECT id, name FROM runline.tenant_members WHERE tenant_id = $1 AND role = 'TECHNICIAN' ORDER BY name, id
  `, [tenantId]);
  return rows;
}

export async function listJobs(client: PoolClient, tenantId: string, date?: string, includeQueue = false) {
  const { rows } = await client.query<Job>(`
    ${selectJobs}
    WHERE j.tenant_id = $1 AND ($2::date IS NULL OR j.service_date = $2 OR ($3 AND j.status = 'UNASSIGNED'))
    ORDER BY j.start_minute NULLS FIRST, CASE j.priority WHEN 'EMERGENCY' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,
             j.created_at DESC, j.id
  `, [tenantId, date ?? null, includeQueue]);
  return rows;
}

export async function findJob(client: PoolClient, tenantId: string, jobId: string) {
  const { rows: [job] } = await client.query<Job>(`
    ${selectJobs} WHERE j.tenant_id = $1 AND j.id = $2
  `, [tenantId, jobId]);
  return job;
}

const eventColumns = `
  e.version, e.action, actor.name AS "actorName", e.previous_status AS "previousStatus", e.status,
  technician.name AS "technicianName", e.service_date::text AS "serviceDate", e.start_minute AS "startMinute",
  e.duration_minutes AS "durationMinutes", e.occurred_at AS "occurredAt", e.arrival_source AS "arrivalSource", e.reason
`;
const eventRows = `
  FROM runline.work_order_events e
  LEFT JOIN runline.tenant_members actor ON actor.tenant_id = e.tenant_id AND actor.id = e.actor_id
  LEFT JOIN runline.tenant_members technician ON technician.tenant_id = e.tenant_id AND technician.id = e.technician_id
`;

export async function listJobEvents(client: PoolClient, tenantId: string, job: Job) {
  const { rows } = await client.query<JobEvent>(`
    SELECT ${eventColumns} ${eventRows}
    WHERE e.tenant_id = $1 AND e.work_order_id = $2 AND e.version <= $3
    ORDER BY e.version DESC
  `, [tenantId, job.id, job.version]);
  return rows;
}

export async function listFieldEvents(client: PoolClient, tenantId: string, jobIds: string[]) {
  const { rows } = await client.query<JobEvent & { jobId: string }>(`
    SELECT e.work_order_id AS "jobId", ${eventColumns} ${eventRows}
    WHERE e.tenant_id = $1 AND e.work_order_id = ANY($2::uuid[])
    ORDER BY e.work_order_id, e.version DESC
  `, [tenantId, jobIds]);
  return rows;
}
