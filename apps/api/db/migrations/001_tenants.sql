CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA runline;

CREATE TABLE runline.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(trim(name)) > 0)
);

ALTER TABLE runline.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON runline.tenants
  TO runline_app
  USING (id = nullif(current_setting('runline.tenant_id', true), '')::uuid);

GRANT USAGE ON SCHEMA runline TO runline_app;
GRANT SELECT ON runline.tenants TO runline_app;
