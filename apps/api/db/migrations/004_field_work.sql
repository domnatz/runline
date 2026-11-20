CREATE TABLE runline.inventory_locations (
  tenant_id uuid NOT NULL REFERENCES runline.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('WAREHOUSE', 'VAN')),
  technician_id uuid,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES runline.tenant_members(tenant_id, id),
  CHECK ((kind = 'VAN') = (technician_id IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (tenant_id, technician_id)
);

CREATE TABLE runline.inventory_parts (
  tenant_id uuid NOT NULL REFERENCES runline.tenants(id),
  sku text NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (tenant_id, sku)
);

CREATE TABLE runline.inventory_stock (
  tenant_id uuid NOT NULL,
  location_id uuid NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (tenant_id, location_id, sku),
  FOREIGN KEY (tenant_id, location_id) REFERENCES runline.inventory_locations(tenant_id, id),
  FOREIGN KEY (tenant_id, sku) REFERENCES runline.inventory_parts(tenant_id, sku)
);

CREATE TABLE runline.job_checklist (
  tenant_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  item_key text NOT NULL CHECK (item_key IN ('inspect', 'repair', 'verify')),
  checked boolean NOT NULL,
  PRIMARY KEY (tenant_id, work_order_id, item_key),
  FOREIGN KEY (tenant_id, work_order_id) REFERENCES runline.work_orders(tenant_id, id)
);

CREATE TABLE runline.job_parts (
  tenant_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  mutation_id uuid NOT NULL,
  location_id uuid NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, technician_id, mutation_id),
  FOREIGN KEY (tenant_id, work_order_id) REFERENCES runline.work_orders(tenant_id, id),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES runline.tenant_members(tenant_id, id),
  FOREIGN KEY (tenant_id, location_id, sku) REFERENCES runline.inventory_stock(tenant_id, location_id, sku)
);

CREATE INDEX job_parts_by_order ON runline.job_parts (tenant_id, work_order_id, recorded_at);

CREATE TABLE runline.sync_batches (
  tenant_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  outcome jsonb NOT NULL,
  PRIMARY KEY (tenant_id, technician_id, key),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES runline.tenant_members(tenant_id, id)
);

CREATE TABLE runline.sync_mutations (
  tenant_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  id uuid NOT NULL,
  request_hash text NOT NULL,
  outcome jsonb NOT NULL,
  PRIMARY KEY (tenant_id, technician_id, id),
  FOREIGN KEY (tenant_id, technician_id) REFERENCES runline.tenant_members(tenant_id, id)
);

CREATE FUNCTION runline.owns_field_data(owner_tenant uuid, owner_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $policy$
  SELECT runline.job_tenant_matches(owner_tenant)
     AND current_setting('runline.role', true) = 'TECHNICIAN'
     AND owner_user = nullif(current_setting('runline.user_id', true), '')::uuid
$policy$;

CREATE FUNCTION runline.owns_field_job(owner_tenant uuid, job_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $policy$
  SELECT EXISTS (
    SELECT 1 FROM runline.work_orders j
    WHERE j.tenant_id = owner_tenant AND j.id = job_id
      AND runline.owns_field_data(j.tenant_id, j.technician_id)
  )
$policy$;

ALTER TABLE runline.inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.inventory_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE runline.inventory_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.inventory_parts FORCE ROW LEVEL SECURITY;
ALTER TABLE runline.inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.inventory_stock FORCE ROW LEVEL SECURITY;
ALTER TABLE runline.job_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.job_checklist FORCE ROW LEVEL SECURITY;
ALTER TABLE runline.job_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.job_parts FORCE ROW LEVEL SECURITY;
ALTER TABLE runline.sync_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.sync_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE runline.sync_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.sync_mutations FORCE ROW LEVEL SECURITY;

CREATE POLICY inventory_location_read ON runline.inventory_locations FOR SELECT TO runline_app
  USING (runline.can_access_work_order(tenant_id, technician_id));
CREATE POLICY inventory_part_read ON runline.inventory_parts FOR SELECT TO runline_app
  USING (runline.job_tenant_matches(tenant_id));
CREATE POLICY inventory_stock_read ON runline.inventory_stock FOR SELECT TO runline_app
  USING (EXISTS (SELECT 1 FROM runline.inventory_locations l
    WHERE l.tenant_id = inventory_stock.tenant_id AND l.id = inventory_stock.location_id));
CREATE POLICY inventory_stock_update ON runline.inventory_stock FOR UPDATE TO runline_app
  USING (EXISTS (SELECT 1 FROM runline.inventory_locations l
    WHERE l.tenant_id = inventory_stock.tenant_id AND l.id = inventory_stock.location_id
      AND runline.owns_field_data(l.tenant_id, l.technician_id)));

CREATE POLICY job_checklist_read ON runline.job_checklist FOR SELECT TO runline_app
  USING (EXISTS (SELECT 1 FROM runline.work_orders j WHERE j.tenant_id = job_checklist.tenant_id AND j.id = job_checklist.work_order_id));
CREATE POLICY job_checklist_insert ON runline.job_checklist FOR INSERT TO runline_app
  WITH CHECK (runline.owns_field_job(tenant_id, work_order_id));
CREATE POLICY job_checklist_update ON runline.job_checklist FOR UPDATE TO runline_app
  USING (runline.owns_field_job(tenant_id, work_order_id));

CREATE POLICY job_parts_read ON runline.job_parts FOR SELECT TO runline_app
  USING (EXISTS (SELECT 1 FROM runline.work_orders j WHERE j.tenant_id = job_parts.tenant_id AND j.id = job_parts.work_order_id));
CREATE POLICY job_parts_append ON runline.job_parts FOR INSERT TO runline_app
  WITH CHECK (runline.owns_field_data(tenant_id, technician_id) AND runline.owns_field_job(tenant_id, work_order_id)
    AND EXISTS (SELECT 1 FROM runline.inventory_locations l WHERE l.tenant_id = job_parts.tenant_id AND l.id = job_parts.location_id
      AND runline.owns_field_data(l.tenant_id, l.technician_id)));

CREATE POLICY sync_batch_owner ON runline.sync_batches TO runline_app
  USING (runline.owns_field_data(tenant_id, technician_id));
CREATE POLICY sync_mutation_owner ON runline.sync_mutations TO runline_app
  USING (runline.owns_field_data(tenant_id, technician_id));

GRANT SELECT ON runline.inventory_locations, runline.inventory_parts, runline.inventory_stock TO runline_app;
GRANT UPDATE (quantity) ON runline.inventory_stock TO runline_app;
GRANT SELECT, INSERT ON runline.job_checklist, runline.job_parts, runline.sync_batches, runline.sync_mutations TO runline_app;
GRANT UPDATE (checked) ON runline.job_checklist TO runline_app;
