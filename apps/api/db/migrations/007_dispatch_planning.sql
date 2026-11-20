ALTER TABLE runline.work_orders ADD COLUMN required_skills text[] NOT NULL DEFAULT '{}';
ALTER TABLE runline.tenant_members ADD COLUMN skills text[] NOT NULL DEFAULT '{}';
ALTER TABLE runline.tenant_members ADD COLUMN base_position geography(Point, 4326);

CREATE INDEX job_locations_recent_technician
  ON runline.job_locations (tenant_id, technician_id, captured_at DESC)
  WHERE position IS NOT NULL;

CREATE OR REPLACE FUNCTION runline.live_trip(job runline.work_orders, ping runline.job_locations, technician_name text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $trip$
  SELECT CASE WHEN ping.position IS NOT NULL THEN jsonb_build_object(
    'jobId', job.id,
    'title', job.title,
    'technicianName', technician_name,
    'position', jsonb_build_object('latitude', ST_Y(ping.position::geometry), 'longitude', ST_X(ping.position::geometry)),
    'destination', CASE WHEN job.destination IS NOT NULL
      THEN jsonb_build_object('latitude', ST_Y(job.destination::geometry), 'longitude', ST_X(job.destination::geometry)) END,
    'capturedAt', ping.captured_at,
    'source', ping.source
  ) END
$trip$;
