import type { PoolClient } from "pg";
import { HttpError } from "../../http-error.js";
import type { ScheduleJob } from "../jobs/contracts.js";
import type { Coordinates } from "../tracking/contracts.js";
import { roadRoute } from "./road-route.js";

export async function matchTechnicians(
  client: PoolClient, tenantId: string, jobId: string, appointment?: Pick<ScheduleJob, "serviceDate" | "startMinute" | "durationMinutes">,
) {
  const { rows: [job] } = await client.query<{ required_skills: string[] }>(
    "SELECT required_skills FROM runline.work_orders WHERE tenant_id = $1 AND id = $2", [tenantId, jobId],
  );
  if (!job) throw new HttpError(404, "Work order not found");

  const { rows } = await client.query<{
    id: string; name: string; missingSkills: string[]; distanceMeters: number | null; nearby: boolean | null; available: boolean;
  }>(`
    SELECT m.id, m.name,
      ARRAY(SELECT tag FROM unnest(j.required_skills) AS tags(tag) WHERE NOT tag = ANY(m.skills)) AS "missingSkills",
      round(ST_Distance(p.start_point, j.destination))::integer AS "distanceMeters",
      ST_DWithin(p.start_point, j.destination, 5000) AS nearby,
      NOT EXISTS (
        SELECT 1 FROM runline.work_orders booked WHERE booked.tenant_id = m.tenant_id AND booked.technician_id = m.id
          AND booked.id <> j.id AND booked.service_date = $3
          AND booked.start_minute < $5 AND booked.start_minute + booked.duration_minutes > $4
      ) AS available
    FROM runline.work_orders j
    JOIN runline.tenant_members m ON m.tenant_id = j.tenant_id AND m.role = 'TECHNICIAN'
    LEFT JOIN LATERAL (
      SELECT l.position FROM runline.job_locations l
      JOIN runline.work_orders active ON active.tenant_id = l.tenant_id AND active.id = l.work_order_id
        AND active.technician_id = l.technician_id AND active.status = 'EN_ROUTE'
      WHERE l.tenant_id = m.tenant_id AND l.technician_id = m.id
        AND l.position IS NOT NULL AND l.captured_at > now() - interval '90 seconds'
      ORDER BY l.captured_at DESC LIMIT 1
    ) live ON true
    CROSS JOIN LATERAL (SELECT COALESCE(live.position, m.base_position) AS start_point) p
    WHERE j.tenant_id = $1 AND j.id = $2
    ORDER BY available DESC, m.skills @> j.required_skills DESC, nearby DESC NULLS LAST, "distanceMeters" NULLS LAST, m.name, m.id
  `, [tenantId, jobId, appointment?.serviceDate ?? null, appointment?.startMinute ?? null,
    appointment ? appointment.startMinute + appointment.durationMinutes : null]);
  return { requiredSkills: job.required_skills, matches: rows };
}

type Neighbor = { direction: "before" | "after"; title: string; gapMinutes: number; destination: Coordinates | null };

export async function readNeighbors(client: PoolClient, tenantId: string, jobId: string, input: ScheduleJob) {
  const { rows: [job] } = await client.query<{ destination: Coordinates | null }>(`
    SELECT CASE WHEN destination IS NOT NULL THEN jsonb_build_object(
      'latitude', ST_Y(destination::geometry), 'longitude', ST_X(destination::geometry)) END AS destination
    FROM runline.work_orders WHERE tenant_id = $1 AND id = $2
  `, [tenantId, jobId]);
  if (!job) throw new HttpError(404, "Work order not found");
  const technician = await client.query(`
    SELECT 1 FROM runline.tenant_members WHERE tenant_id = $1 AND id = $2 AND role = 'TECHNICIAN'
  `, [tenantId, input.technicianId]);
  if (!technician.rowCount) throw new HttpError(400, "Choose a technician from your organization");

  const { rows: neighbors } = await client.query<Neighbor>(`
    WITH appointments AS (
      SELECT id, title, start_minute, start_minute + duration_minutes AS end_minute,
        CASE WHEN destination IS NOT NULL THEN jsonb_build_object(
          'latitude', ST_Y(destination::geometry), 'longitude', ST_X(destination::geometry)) END AS destination
      FROM runline.work_orders
      WHERE tenant_id = $1 AND id <> $2 AND technician_id = $3 AND service_date = $4
    )
    (SELECT 'before' AS direction, title, $5::int - end_minute AS "gapMinutes", destination
     FROM appointments WHERE start_minute <= $5 ORDER BY start_minute DESC, id LIMIT 1)
    UNION ALL
    (SELECT 'after' AS direction, title, start_minute - $6::int AS "gapMinutes", destination
     FROM appointments WHERE start_minute > $5 ORDER BY start_minute, id LIMIT 1)
  `, [tenantId, jobId, input.technicianId, input.serviceDate, input.startMinute, input.startMinute + input.durationMinutes]);
  return { destination: job.destination, neighbors };
}

export async function travelWarnings({ destination, neighbors }: Awaited<ReturnType<typeof readNeighbors>>) {
  return Promise.all(neighbors.map(async ({ direction, title, gapMinutes, destination: neighbor }) => {
    const route = direction === "before" ? await roadRoute(neighbor, destination) : await roadRoute(destination, neighbor);
    const driveMinutes = route ? Math.max(1, Math.ceil(route.seconds / 60)) : null;
    const status = gapMinutes < 0 ? "OVERLAP" : driveMinutes === null ? "UNAVAILABLE"
      : driveMinutes > gapMinutes ? "SHORT_GAP" : "ENOUGH_TIME";
    return { direction, title, gapMinutes, driveMinutes, status };
  }));
}
