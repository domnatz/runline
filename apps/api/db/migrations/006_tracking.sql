ALTER TABLE runline.work_orders ADD COLUMN destination geography(Point, 4326);
ALTER TABLE runline.work_order_events ADD COLUMN arrival_source text
  CHECK (arrival_source IS NULL OR (arrival_source IN ('manual', 'geofence') AND status = 'ARRIVED' AND action = 'STATUS_CHANGED'));

CREATE TABLE runline.job_locations (
  tenant_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  position geography(Point, 4326),
  accuracy_meters double precision NOT NULL CHECK (accuracy_meters BETWEEN 0 AND 5000),
  captured_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('device', 'demo')),
  PRIMARY KEY (tenant_id, work_order_id),
  FOREIGN KEY (tenant_id, work_order_id) REFERENCES runline.work_orders(tenant_id, id),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES runline.tenant_members(tenant_id, id)
);

ALTER TABLE runline.job_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.job_locations FORCE ROW LEVEL SECURITY;

CREATE POLICY location_read ON runline.job_locations FOR SELECT TO runline_app
  USING (runline.can_access_work_order(tenant_id, technician_id));
CREATE POLICY location_record ON runline.job_locations FOR INSERT TO runline_app
  WITH CHECK (runline.owns_field_data(tenant_id, technician_id) AND runline.owns_field_job(tenant_id, work_order_id));
CREATE POLICY location_replace ON runline.job_locations FOR UPDATE TO runline_app
  USING (runline.owns_field_data(tenant_id, technician_id))
  WITH CHECK (runline.owns_field_data(tenant_id, technician_id) AND runline.owns_field_job(tenant_id, work_order_id));
CREATE POLICY location_discard ON runline.job_locations FOR DELETE TO runline_app
  USING (runline.owns_field_data(tenant_id, technician_id));
GRANT SELECT, INSERT, DELETE ON runline.job_locations TO runline_app;
GRANT UPDATE (position, accuracy_meters, captured_at, source) ON runline.job_locations TO runline_app;

CREATE FUNCTION runline.customer_work_order(owner_tenant uuid, target_job uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $policy$
  SELECT current_setting('runline.role', true) = 'CUSTOMER'
    AND runline.job_tenant_matches(owner_tenant)
    AND target_job = nullif(current_setting('runline.job_id', true), '')::uuid
$policy$;

CREATE POLICY invoice_job_scope ON runline.invoices FOR SELECT TO runline_app
  USING (runline.customer_work_order(tenant_id, work_order_id));

CREATE FUNCTION runline.live_trip(job runline.work_orders, ping runline.job_locations, technician_name text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $trip$
  SELECT CASE WHEN ping.position IS NOT NULL THEN jsonb_build_object(
    'jobId', job.id,
    'title', job.title,
    'technicianName', technician_name,
    'position', jsonb_build_object('latitude', ST_Y(ping.position::geometry), 'longitude', ST_X(ping.position::geometry)),
    'destination', CASE WHEN job.destination IS NOT NULL
      THEN jsonb_build_object('latitude', ST_Y(job.destination::geometry), 'longitude', ST_X(job.destination::geometry)) END,
    'etaMinutes', CASE WHEN job.destination IS NOT NULL
      THEN greatest(1, ceil(ST_Distance(ping.position, job.destination) * 60 / 25000))::int END,
    'capturedAt', ping.captured_at,
    'source', ping.source
  ) END
$trip$;

-- expose just the customer projection without widening access to operational tables.
CREATE FUNCTION runline.customer_tracking(owner_tenant uuid, target_job uuid)
RETURNS TABLE (
  "jobId" uuid, "tenantName" text, title text, "customerName" text, address text, status text,
  trip jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $tracking$
  SELECT j.id, t.name, j.title, j.customer_name, j.address, j.status, runline.live_trip(j, p, m.name)
  FROM runline.work_orders j
  JOIN runline.tenants t ON t.id = j.tenant_id
  LEFT JOIN runline.job_locations p ON j.status = 'EN_ROUTE' AND p.tenant_id = j.tenant_id
    AND p.work_order_id = j.id AND p.technician_id = j.technician_id AND p.captured_at > now() - interval '90 seconds'
  LEFT JOIN runline.tenant_members m ON m.tenant_id = j.tenant_id AND m.id = j.technician_id
  WHERE j.tenant_id = owner_tenant AND j.id = target_job AND runline.customer_work_order(j.tenant_id, j.id)
$tracking$;

REVOKE ALL ON FUNCTION runline.customer_tracking(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION runline.customer_tracking(uuid, uuid) TO runline_app;

CREATE FUNCTION runline.notify_tracking() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $notify$
BEGIN
  IF TG_TABLE_NAME = 'work_orders' THEN
    PERFORM pg_notify('runline_tracking', NEW.tenant_id::text || ':' || NEW.id::text);
  ELSE
    PERFORM pg_notify('runline_tracking', NEW.tenant_id::text || ':' || NEW.work_order_id::text);
  END IF;
  RETURN NULL;
END
$notify$;

CREATE TRIGGER notify_tracking_job AFTER INSERT OR UPDATE OF version ON runline.work_orders
  FOR EACH ROW EXECUTE FUNCTION runline.notify_tracking();
CREATE TRIGGER notify_tracking_location AFTER INSERT OR UPDATE ON runline.job_locations
  FOR EACH ROW EXECUTE FUNCTION runline.notify_tracking();
