CREATE TABLE runline.tenant_members (
  tenant_id uuid NOT NULL REFERENCES runline.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  email text NOT NULL CHECK (email = lower(email)),
  role text NOT NULL CHECK (role IN ('ADMIN', 'DISPATCHER', 'TECHNICIAN')),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, email)
);

ALTER TABLE runline.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.tenant_members FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON runline.tenant_members
  TO runline_app
  USING (tenant_id = nullif(current_setting('runline.tenant_id', true), '')::uuid);

GRANT SELECT ON runline.tenant_members TO runline_app;
