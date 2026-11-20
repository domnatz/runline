CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE runline.tenants ADD COLUMN time_zone text NOT NULL DEFAULT 'Asia/Manila';

CREATE TABLE runline.work_orders (
  tenant_id uuid NOT NULL REFERENCES runline.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
  customer_name text NOT NULL CHECK (length(trim(customer_name)) BETWEEN 1 AND 100),
  address text NOT NULL CHECK (length(trim(address)) BETWEEN 1 AND 200),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  priority text NOT NULL CHECK (priority IN ('STANDARD', 'HIGH', 'EMERGENCY')),
  status text NOT NULL DEFAULT 'UNASSIGNED' CHECK (status IN ('UNASSIGNED', 'SCHEDULED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED')),
  technician_id uuid,
  service_date date,
  start_minute smallint,
  duration_minutes smallint,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES runline.tenant_members(tenant_id, id),
  CONSTRAINT work_order_schedule_shape CHECK (
    (status = 'UNASSIGNED' AND technician_id IS NULL AND service_date IS NULL AND start_minute IS NULL AND duration_minutes IS NULL)
    OR (status <> 'UNASSIGNED' AND technician_id IS NOT NULL AND service_date IS NOT NULL
        AND start_minute IS NOT NULL AND duration_minutes IS NOT NULL
        AND start_minute >= 420 AND duration_minutes >= 15 AND start_minute + duration_minutes <= 1140)
  ),
  CONSTRAINT work_order_no_overlap EXCLUDE USING gist (
    tenant_id WITH =,
    technician_id WITH =,
    service_date WITH =,
    int4range(start_minute, start_minute + duration_minutes, '[)') WITH &&
  ) WHERE (technician_id IS NOT NULL)
);

CREATE INDEX work_orders_schedule ON runline.work_orders(tenant_id, service_date, start_minute);
CREATE INDEX work_orders_technician_route ON runline.work_orders(tenant_id, technician_id, service_date, start_minute);

CREATE FUNCTION runline.job_tenant_matches(job_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE AS $policy$
  SELECT job_tenant = nullif(current_setting('runline.tenant_id', true), '')::uuid
$policy$;

CREATE FUNCTION runline.is_dispatch_staff() RETURNS boolean
LANGUAGE sql STABLE AS $policy$
  SELECT current_setting('runline.role', true) IN ('ADMIN', 'DISPATCHER')
$policy$;

CREATE FUNCTION runline.can_access_work_order(job_tenant uuid, technician uuid) RETURNS boolean
LANGUAGE sql STABLE AS $policy$
  SELECT runline.job_tenant_matches(job_tenant)
     AND (runline.is_dispatch_staff()
          OR (current_setting('runline.role', true) = 'TECHNICIAN'
              AND technician = nullif(current_setting('runline.user_id', true), '')::uuid))
$policy$;

ALTER TABLE runline.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.work_orders FORCE ROW LEVEL SECURITY;

CREATE POLICY work_order_read ON runline.work_orders FOR SELECT TO runline_app
  USING (runline.can_access_work_order(tenant_id, technician_id));

CREATE POLICY work_order_create ON runline.work_orders FOR INSERT TO runline_app
  WITH CHECK (runline.job_tenant_matches(tenant_id) AND runline.is_dispatch_staff());

CREATE POLICY work_order_update ON runline.work_orders FOR UPDATE TO runline_app
  USING (runline.can_access_work_order(tenant_id, technician_id))
  WITH CHECK (runline.can_access_work_order(tenant_id, technician_id));

GRANT SELECT, INSERT ON runline.work_orders TO runline_app;
GRANT UPDATE (status, technician_id, service_date, start_minute, duration_minutes, version)
  ON runline.work_orders TO runline_app;

CREATE TABLE runline.work_order_events (
  tenant_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  actor_id uuid,
  action text NOT NULL CHECK (action IN ('CREATED', 'ASSIGNED', 'RESCHEDULED', 'STATUS_CHANGED')),
  previous_status text,
  status text NOT NULL,
  technician_id uuid,
  service_date date,
  start_minute smallint,
  duration_minutes smallint,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, work_order_id, version),
  FOREIGN KEY (tenant_id, work_order_id) REFERENCES runline.work_orders(tenant_id, id),
  FOREIGN KEY (tenant_id, actor_id) REFERENCES runline.tenant_members(tenant_id, id),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES runline.tenant_members(tenant_id, id)
);

ALTER TABLE runline.work_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.work_order_events FORCE ROW LEVEL SECURITY;

CREATE POLICY work_order_event_read ON runline.work_order_events FOR SELECT TO runline_app
  USING (runline.job_tenant_matches(tenant_id) AND EXISTS (
    SELECT 1 FROM runline.work_orders AS job
    WHERE job.tenant_id = work_order_events.tenant_id AND job.id = work_order_events.work_order_id
  ));

CREATE POLICY work_order_event_append ON runline.work_order_events FOR INSERT TO runline_app
  WITH CHECK (runline.job_tenant_matches(tenant_id)
    AND actor_id = nullif(current_setting('runline.user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM runline.work_orders AS job
      WHERE job.tenant_id = work_order_events.tenant_id AND job.id = work_order_events.work_order_id
    ));

GRANT SELECT, INSERT ON runline.work_order_events TO runline_app;
