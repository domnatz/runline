import pg, { type PoolClient } from "pg";
import { HttpError } from "../../http-error.js";
import type { Session } from "../auth/contracts.js";
import { issueInvoice } from "../billing/issue.js";
import type { AdvanceJob, CancelJob, EditJob, JobEvent, JobStatus, NewJob, ScheduleJob } from "./contracts.js";
import { findJob } from "./queries.js";

const nextStatus: Partial<Record<JobStatus, JobStatus>> = {
  SCHEDULED: "EN_ROUTE",
  EN_ROUTE: "ARRIVED",
  ARRIVED: "COMPLETED",
};

export async function appendJobEvent(
  client: Pick<PoolClient, "query">,
  tenantId: string,
  jobId: string,
  actorId: string | null,
  action: JobEvent["action"],
  previousStatus: JobStatus | null = null,
  arrivalSource: JobEvent["arrivalSource"] = null,
  reason: string | null = null,
) {
  const event = await client.query(`
    INSERT INTO runline.work_order_events (
      tenant_id, work_order_id, version, actor_id, action, previous_status, status,
      technician_id, service_date, start_minute, duration_minutes, arrival_source, reason
    )
    SELECT tenant_id, id, version, $3, $4, $5, status, technician_id, service_date, start_minute, duration_minutes, $6, $7
    FROM runline.work_orders WHERE tenant_id = $1 AND id = $2
  `, [tenantId, jobId, actorId, action, previousStatus, arrivalSource, reason]);
  if (event.rowCount !== 1) throw new Error("Work order event was not recorded");
}

export async function createJob(client: PoolClient, session: Session, input: NewJob) {
  const { rows: [job] } = await client.query<{ id: string }>(`
    INSERT INTO runline.work_orders (tenant_id, title, customer_name, address, notes, priority, destination, required_skills)
    VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9) RETURNING id
  `, [session.tenantId, input.title, input.customerName, input.address, input.notes, input.priority,
    input.destination?.longitude ?? null, input.destination?.latitude ?? null, [...new Set(input.requiredSkills)]]);
  if (!job) throw new Error("Work order was not created");
  await appendJobEvent(client, session.tenantId, job.id, session.userId, "CREATED");
  return job;
}

async function currentJob(client: PoolClient, tenantId: string, jobId: string, version: number) {
  const job = await findJob(client, tenantId, jobId);
  if (!job) throw new HttpError(404, "Work order not found");
  if (job.version !== version) throw new HttpError(409, "This work order changed. Refresh and try again.");
  return job;
}

async function editableJob(client: PoolClient, tenantId: string, jobId: string, version: number) {
  const job = await currentJob(client, tenantId, jobId, version);
  if (job.status !== "UNASSIGNED" && job.status !== "SCHEDULED") {
    throw new HttpError(409, "Only unassigned or scheduled work orders can be edited or cancelled.");
  }
  return job;
}

export async function editJob(client: PoolClient, { tenantId, userId }: Session, jobId: string, input: EditJob) {
  const job = await editableJob(client, tenantId, jobId, input.version);
  const { address, priority, notes, destination, version } = input;
  if (address === job.address && priority === job.priority && notes === job.notes && (!destination || (
    destination.latitude === job.destination?.latitude && destination.longitude === job.destination?.longitude
  ))) return;

  const changed = await client.query(`
    UPDATE runline.work_orders SET address = $4, priority = $5, notes = $6, version = version + 1,
      destination = CASE WHEN $7::double precision IS NOT NULL AND $8::double precision IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography
        WHEN address IS DISTINCT FROM $4 THEN NULL ELSE destination END
    WHERE tenant_id = $1 AND id = $2 AND version = $3
  `, [tenantId, jobId, version, address, priority, notes, destination?.longitude ?? null, destination?.latitude ?? null]);
  if (changed.rowCount !== 1) throw new HttpError(409, "This work order changed. Refresh and try again.");
  await appendJobEvent(client, tenantId, jobId, userId, "EDITED", job.status);
}

export async function cancelJob(client: PoolClient, { tenantId, userId }: Session, jobId: string, input: CancelJob) {
  const job = await editableJob(client, tenantId, jobId, input.version);
  const changed = await client.query(`
    UPDATE runline.work_orders SET status = 'CANCELLED', technician_id = NULL, service_date = NULL,
      start_minute = NULL, duration_minutes = NULL, version = version + 1
    WHERE tenant_id = $1 AND id = $2 AND version = $3
  `, [tenantId, jobId, input.version]);
  if (changed.rowCount !== 1) throw new HttpError(409, "This work order changed. Refresh and try again.");
  await appendJobEvent(client, tenantId, jobId, userId, "CANCELLED", job.status, null, input.reason);
}

export async function scheduleJob(client: PoolClient, session: Session, jobId: string, input: ScheduleJob) {
  const { tenantId, userId } = session;
  const job = await currentJob(client, tenantId, jobId, input.version);
  if (job.status !== "UNASSIGNED" && job.status !== "SCHEDULED") {
    throw new HttpError(409, "Only unassigned or scheduled jobs can be assigned");
  }

  const technician = await client.query(`
    SELECT 1 FROM runline.tenant_members WHERE tenant_id = $1 AND id = $2 AND role = 'TECHNICIAN'
  `, [tenantId, input.technicianId]);
  if (!technician.rowCount) throw new HttpError(400, "Choose a technician from your organization");

  const changed = await client.query(`
    UPDATE runline.work_orders
    SET status = 'SCHEDULED', technician_id = $4, service_date = $5, start_minute = $6, duration_minutes = $7,
        version = version + 1
    WHERE tenant_id = $1 AND id = $2 AND version = $3
  `, [tenantId, jobId, input.version, input.technicianId, input.serviceDate, input.startMinute, input.durationMinutes])
    .catch((error: unknown) => {
      if (error instanceof pg.DatabaseError && error.constraint === "work_order_no_overlap") {
        throw new HttpError(409, "This technician already has a job during that appointment");
      }
      throw error;
    });

  if (changed.rowCount !== 1) throw new HttpError(409, "This work order changed. Refresh and try again.");
  const action = job.status === "UNASSIGNED" ? "ASSIGNED" : "RESCHEDULED";
  await appendJobEvent(client, tenantId, jobId, userId, action, job.status);
}

export async function advanceJob(
  client: PoolClient, session: Session, jobId: string, input: AdvanceJob, arrivalSource: "manual" | "geofence" = "manual",
) {
  const { tenantId, userId } = session;
  const job = await currentJob(client, tenantId, jobId, input.version);
  if (nextStatus[job.status] !== input.status) {
    throw new HttpError(409, "Move the work order to its next status");
  }

  const changed = await client.query(`
    UPDATE runline.work_orders SET status = $4, version = version + 1
    WHERE tenant_id = $1 AND id = $2 AND version = $3 AND technician_id = $5
  `, [tenantId, jobId, input.version, input.status, userId]);
  if (changed.rowCount !== 1) throw new HttpError(409, "This work order changed. Refresh and try again.");
  await appendJobEvent(client, tenantId, jobId, userId, "STATUS_CHANGED", job.status, input.status === "ARRIVED" ? arrivalSource : null);
  if (input.status === "ARRIVED") {
    await client.query("DELETE FROM runline.job_locations WHERE tenant_id = $1 AND work_order_id = $2", [tenantId, jobId]);
  }
  if (input.status === "COMPLETED") await issueInvoice(client, tenantId, jobId);
}
