ALTER TABLE runline.tenants ADD COLUMN labor_price_minor integer NOT NULL DEFAULT 180000 CHECK (labor_price_minor > 0);
ALTER TABLE runline.inventory_parts ADD COLUMN unit_price_minor integer NOT NULL DEFAULT 30000 CHECK (unit_price_minor > 0);

CREATE TABLE runline.invoices (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL,
  tenant_name text NOT NULL,
  job_title text NOT NULL,
  customer_name text NOT NULL,
  address text NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_minor integer NOT NULL CHECK (total_minor > 0),
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz CHECK (paid_at >= issued_at),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, work_order_id),
  FOREIGN KEY (tenant_id, work_order_id) REFERENCES runline.work_orders(tenant_id, id)
);

CREATE TABLE runline.invoice_lines (
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  description text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_minor integer NOT NULL CHECK (unit_minor > 0),
  PRIMARY KEY (tenant_id, invoice_id, line_number),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES runline.invoices(tenant_id, id)
);

-- each immutable posting holds both accounts and a single amount, so its two sides always balance.
CREATE TABLE runline.ledger_entries (
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  event text NOT NULL,
  debit_account text NOT NULL,
  credit_account text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  posted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, invoice_id, event),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES runline.invoices(tenant_id, id),
  CHECK ((event = 'ISSUED' AND debit_account = 'RECEIVABLES' AND credit_account = 'SERVICE_REVENUE')
      OR (event = 'SETTLED' AND debit_account = 'DEMO_CLEARING' AND credit_account = 'RECEIVABLES'))
);

CREATE TABLE runline.payment_attempts (
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  scenario text NOT NULL CHECK (scenario IN ('success', 'decline', 'timeout')),
  outcome text NOT NULL CHECK (outcome IN ('PAID', 'DECLINED')),
  PRIMARY KEY (tenant_id, invoice_id, idempotency_key),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES runline.invoices(tenant_id, id)
);

CREATE TABLE runline.billing_documents (
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('invoice', 'receipt')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  PRIMARY KEY (tenant_id, invoice_id, kind),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES runline.invoices(tenant_id, id)
);

CREATE INDEX billing_documents_pending ON runline.billing_documents(requested_at) WHERE ready_at IS NULL;

CREATE FUNCTION runline.scoped_invoice(owner_tenant uuid, target_invoice uuid) RETURNS boolean
LANGUAGE sql STABLE AS $policy$
  SELECT runline.job_tenant_matches(owner_tenant)
     AND target_invoice = nullif(current_setting('runline.invoice_id', true), '')::uuid
$policy$;

CREATE FUNCTION runline.customer_invoice(owner_tenant uuid, target_invoice uuid) RETURNS boolean
LANGUAGE sql STABLE AS $policy$
  SELECT current_setting('runline.role', true) = 'CUSTOMER' AND runline.scoped_invoice(owner_tenant, target_invoice)
$policy$;

ALTER TABLE runline.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE runline.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.invoice_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE runline.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.ledger_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE runline.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.payment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE runline.billing_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE runline.billing_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY invoice_read ON runline.invoices FOR SELECT TO runline_app
  USING ((runline.job_tenant_matches(tenant_id) AND runline.is_dispatch_staff())
    OR runline.owns_field_job(tenant_id, work_order_id) OR runline.customer_invoice(tenant_id, id));
CREATE POLICY invoice_issue ON runline.invoices FOR INSERT TO runline_app
  WITH CHECK (runline.owns_field_job(tenant_id, work_order_id) AND paid_at IS NULL);
CREATE POLICY invoice_pay ON runline.invoices FOR UPDATE TO runline_app
  USING (runline.customer_invoice(tenant_id, id)) WITH CHECK (runline.customer_invoice(tenant_id, id));
CREATE POLICY worker_invoice ON runline.invoices FOR SELECT TO runline_documents
  USING (runline.scoped_invoice(tenant_id, id));

CREATE FUNCTION runline.visible_invoice(owner_tenant uuid, target_invoice uuid) RETURNS boolean
LANGUAGE sql STABLE AS $policy$
  SELECT EXISTS (SELECT 1 FROM runline.invoices i WHERE i.tenant_id = owner_tenant AND i.id = target_invoice)
$policy$;

CREATE POLICY invoice_line_read ON runline.invoice_lines FOR SELECT TO runline_app, runline_documents
  USING (runline.visible_invoice(tenant_id, invoice_id));
CREATE POLICY invoice_line_create ON runline.invoice_lines FOR INSERT TO runline_app
  WITH CHECK (current_setting('runline.role', true) = 'TECHNICIAN' AND runline.visible_invoice(tenant_id, invoice_id));

CREATE POLICY ledger_read ON runline.ledger_entries FOR SELECT TO runline_app
  USING (runline.job_tenant_matches(tenant_id) AND current_setting('runline.role', true) = 'ADMIN');
CREATE POLICY ledger_post ON runline.ledger_entries FOR INSERT TO runline_app
  WITH CHECK (runline.visible_invoice(tenant_id, invoice_id) AND (
    (event = 'ISSUED' AND current_setting('runline.role', true) = 'TECHNICIAN')
    OR (event = 'SETTLED' AND runline.customer_invoice(tenant_id, invoice_id))
  ));

CREATE POLICY payment_attempt_scope ON runline.payment_attempts TO runline_app
  USING (runline.customer_invoice(tenant_id, invoice_id));

CREATE POLICY document_read ON runline.billing_documents FOR SELECT TO runline_app
  USING (runline.visible_invoice(tenant_id, invoice_id));
CREATE POLICY document_request ON runline.billing_documents FOR INSERT TO runline_app
  WITH CHECK (runline.visible_invoice(tenant_id, invoice_id) AND ready_at IS NULL AND (
    (kind = 'invoice' AND current_setting('runline.role', true) = 'TECHNICIAN')
    OR (kind = 'receipt' AND runline.customer_invoice(tenant_id, invoice_id))
  ));
CREATE POLICY worker_pending_documents ON runline.billing_documents FOR SELECT TO runline_documents USING (true);
CREATE POLICY worker_publish_document ON runline.billing_documents FOR UPDATE TO runline_documents
  USING (runline.scoped_invoice(tenant_id, invoice_id)) WITH CHECK (runline.scoped_invoice(tenant_id, invoice_id));

GRANT SELECT, INSERT ON runline.invoices, runline.invoice_lines, runline.ledger_entries,
  runline.payment_attempts, runline.billing_documents TO runline_app;
GRANT UPDATE (paid_at) ON runline.invoices TO runline_app;
GRANT USAGE ON SCHEMA runline TO runline_documents;
GRANT SELECT ON runline.invoices, runline.invoice_lines, runline.billing_documents TO runline_documents;
GRANT UPDATE (ready_at) ON runline.billing_documents TO runline_documents;
