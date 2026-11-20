CREATE TABLE runline.notifications (
  tenant_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  version integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('APPOINTMENT_CONFIRMED', 'APPOINTMENT_CHANGED', 'TECHNICIAN_EN_ROUTE', 'TECHNICIAN_ARRIVED')),
  delivery_status text NOT NULL DEFAULT 'SIMULATED' CHECK (delivery_status = 'SIMULATED'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, work_order_id, version),
  FOREIGN KEY (tenant_id, work_order_id, version) REFERENCES runline.work_order_events (tenant_id, work_order_id, version)
);

CREATE INDEX notifications_recent ON runline.notifications (tenant_id, created_at DESC);
ALTER TABLE runline.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_admin_read ON runline.notifications FOR SELECT TO runline_app
  USING (runline.job_tenant_matches(tenant_id) AND current_setting('runline.role', true) = 'ADMIN');
CREATE POLICY notification_record ON runline.notifications FOR INSERT TO runline_app
  WITH CHECK (runline.job_tenant_matches(tenant_id)
    AND current_setting('runline.demo_mode', true) = 'true'
    AND (runline.is_dispatch_staff() OR runline.owns_field_job(tenant_id, work_order_id)));
GRANT SELECT, INSERT ON runline.notifications TO runline_app;

CREATE FUNCTION runline.notification_kind(action text, status text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $kind$
  SELECT CASE
    WHEN (action = 'CREATED' OR action = 'ASSIGNED') AND status = 'SCHEDULED' THEN 'APPOINTMENT_CONFIRMED'
    WHEN action = 'RESCHEDULED' THEN 'APPOINTMENT_CHANGED'
    WHEN action = 'STATUS_CHANGED' AND status = 'EN_ROUTE' THEN 'TECHNICIAN_EN_ROUTE'
    WHEN action = 'STATUS_CHANGED' AND status = 'ARRIVED' THEN 'TECHNICIAN_ARRIVED'
  END
$kind$;

CREATE FUNCTION runline.queue_demo_notification() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $queue$
DECLARE event_kind text;
BEGIN
  IF current_setting('runline.demo_mode', true) IS DISTINCT FROM 'true' THEN
    RETURN NULL;
  END IF;
  event_kind := runline.notification_kind(NEW.action, NEW.status);
  IF event_kind IS NOT NULL THEN
    INSERT INTO runline.notifications (tenant_id, work_order_id, version, kind, created_at)
    VALUES (NEW.tenant_id, NEW.work_order_id, NEW.version, event_kind, NEW.occurred_at);
  END IF;
  RETURN NULL;
END
$queue$;

CREATE TRIGGER queue_demo_notification AFTER INSERT ON runline.work_order_events
  FOR EACH ROW EXECUTE FUNCTION runline.queue_demo_notification();
