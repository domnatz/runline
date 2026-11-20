import type { PoolClient } from "pg";
import { HttpError } from "../../http-error.js";
import type { Session } from "../auth/contracts.js";
import { advanceJob } from "../jobs/mutations.js";
import type { LocationPing } from "./contracts.js";

const replayOffsets = [
  { latitude: -0.010, longitude: -0.014 },
  { latitude: -0.007, longitude: -0.009 },
  { latitude: -0.003, longitude: -0.004 },
  { latitude: -0.0002, longitude: -0.0002 },
];

async function assignedJob(client: PoolClient, { tenantId, userId }: Session, jobId: string, lock = false) {
  const { rows: [job] } = await client.query<{
    status: string; version: number; latitude: number | null; longitude: number | null;
  }>(`
    SELECT status, version, ST_Y(destination::geometry) AS latitude, ST_X(destination::geometry) AS longitude
    FROM runline.work_orders WHERE tenant_id = $1 AND id = $2 AND technician_id = $3 ${lock ? "FOR UPDATE" : ""}
  `, [tenantId, jobId, userId]);
  if (!job) throw new HttpError(404, "Work order not found");
  return job;
}

export async function canReplay(client: PoolClient, session: Session, jobId: string, demoMode: boolean) {
  const job = await assignedJob(client, session, jobId);
  return demoMode && job.latitude !== null && job.status === "EN_ROUTE";
}

export async function recordLocation(client: PoolClient, session: Session, jobId: string, input: LocationPing | { step: number }) {
  const job = await assignedJob(client, session, jobId, true);
  if (job.status !== "EN_ROUTE") throw new HttpError(409, "Only an en route work order accepts location updates");

  let ping: LocationPing;
  let source: "demo" | "device";
  if ("step" in input) {
    const offset = replayOffsets[input.step];
    if (!offset || job.latitude === null || job.longitude === null) throw new HttpError(409, "Route replay requires a destination");
    ping = { latitude: Math.max(-90, job.latitude + offset.latitude),
      longitude: ((job.longitude + offset.longitude + 540) % 360) - 180,
      accuracyMeters: 5, capturedAt: new Date().toISOString() };
    source = "demo";
  } else {
    ping = input;
    source = "device";
  }

  const age = Date.now() - Date.parse(ping.capturedAt);
  if (age > 90000 || age < -5000) throw new HttpError(400, "Send a current location sample");
  const scope = [session.tenantId, jobId];
  const result = await client.query(`
    INSERT INTO runline.job_locations AS p (tenant_id, work_order_id, technician_id, position, accuracy_meters, captured_at, source)
    VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, $8)
    ON CONFLICT (tenant_id, work_order_id) DO UPDATE SET
      position = EXCLUDED.position, accuracy_meters = EXCLUDED.accuracy_meters,
      captured_at = EXCLUDED.captured_at, source = EXCLUDED.source
    WHERE p.captured_at < EXCLUDED.captured_at
  `, [...scope, session.userId, ping.longitude, ping.latitude, ping.accuracyMeters, ping.capturedAt, source]);
  if (result.rowCount !== 1) return { accepted: false, arrived: false };

  const { rows: [check] } = await client.query<{ arrived: boolean }>(`
    SELECT p.accuracy_meters <= 50
      AND ST_DWithin(j.destination, p.position, greatest(0, 100 - p.accuracy_meters)) AS arrived
    FROM runline.job_locations p JOIN runline.work_orders j ON j.tenant_id = p.tenant_id AND j.id = p.work_order_id
    WHERE p.tenant_id = $1 AND p.work_order_id = $2
  `, scope);
  const arrived = check?.arrived === true;
  if (arrived) await advanceJob(client, session, jobId, { status: "ARRIVED", version: job.version }, "geofence");
  return { accepted: true, arrived };
}

export async function stopLocation(client: PoolClient, session: Session, jobId: string) {
  const job = await assignedJob(client, session, jobId, true);
  if (job.status !== "EN_ROUTE") return;
  // leave a timestamp without coordinates so an older in-flight ping cannot restore a stopped location.
  await client.query(`
    INSERT INTO runline.job_locations AS p (tenant_id, work_order_id, technician_id, position, accuracy_meters, captured_at, source)
    VALUES ($1, $2, $3, NULL, 0, clock_timestamp(), 'device')
    ON CONFLICT (tenant_id, work_order_id) DO UPDATE SET
      position = NULL, captured_at = greatest(p.captured_at, EXCLUDED.captured_at)
  `, [session.tenantId, jobId, session.userId]);
}
