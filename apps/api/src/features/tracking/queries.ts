import type { PoolClient } from "pg";
import { roadRoute } from "../dispatch/road-route.js";
import type { JobStatus } from "../jobs/contracts.js";
import type { Coordinates } from "./contracts.js";

type Trip = {
  jobId: string; title: string; technicianName: string; position: Coordinates; destination: Coordinates | null;
  capturedAt: string; source: "device" | "demo";
};

type CustomerStatus = {
  jobId: string; tenantName: string; title: string; customerName: string; address: string; status: JobStatus; trip: Trip | null;
};

export async function routeTrip(trip: Trip) {
  const route = await roadRoute(trip.position, trip.destination);
  return {
    ...trip,
    etaMinutes: route ? Math.max(1, Math.ceil(route.seconds / 60)) : null,
    route: route?.line ?? null,
  };
}

export async function dispatchTracking(client: PoolClient, tenantId: string, date: string) {
  const { rows } = await client.query<{ id: string; version: number; trip: Trip | null }>(`
    SELECT j.id, j.version, runline.live_trip(j, p, m.name) AS trip
    FROM runline.work_orders j
    LEFT JOIN runline.job_locations p ON j.status = 'EN_ROUTE' AND p.tenant_id = j.tenant_id
      AND p.work_order_id = j.id AND p.technician_id = j.technician_id AND p.captured_at > now() - interval '90 seconds'
    LEFT JOIN runline.tenant_members m ON m.tenant_id = j.tenant_id AND m.id = j.technician_id
    WHERE j.tenant_id = $1 AND (j.service_date = $2 OR j.status = 'UNASSIGNED')
    ORDER BY j.id
  `, [tenantId, date]);
  return {
    jobs: rows.map(({ id, version }) => ({ id, version })),
    trips: rows.flatMap(({ trip }) => trip ? [trip] : []),
  };
}

export async function customerTracking(client: PoolClient, { tenantId, jobId }: { tenantId: string; jobId: string }) {
  const { rows: [job] } = await client.query<CustomerStatus>("SELECT * FROM runline.customer_tracking($1, $2)", [tenantId, jobId]);
  return job;
}
