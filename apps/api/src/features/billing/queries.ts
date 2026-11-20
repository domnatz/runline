import type { PoolClient } from "pg";

export type DocumentKind = "invoice" | "receipt";
export type InvoiceScope = { tenantId: string; invoiceId: string };
export type InvoiceLine = { description: string; quantity: number; unitMinor: number };
export type Invoice = {
  id: string; jobId: string; tenantName: string; jobTitle: string; customerName: string; address: string;
  currency: string; totalMinor: number; issuedAt: Date; paidAt: Date | null;
};

const invoiceFields = `
  id, work_order_id AS "jobId", tenant_name AS "tenantName", job_title AS "jobTitle",
  customer_name AS "customerName", address, currency, total_minor AS "totalMinor",
  issued_at AS "issuedAt", paid_at AS "paidAt"
`;

export async function invoiceByJob(client: PoolClient, tenantId: string, jobId: string) {
  const { rows: [invoice] } = await client.query<Invoice>(`
    SELECT ${invoiceFields} FROM runline.invoices WHERE tenant_id = $1 AND work_order_id = $2
  `, [tenantId, jobId]);
  return invoice;
}

export async function readInvoice(client: PoolClient, scope: InvoiceScope, lock = false) {
  const { rows: [invoice] } = await client.query<Invoice>(`
    SELECT ${invoiceFields} FROM runline.invoices WHERE tenant_id = $1 AND id = $2 ${lock ? "FOR UPDATE" : ""}
  `, [scope.tenantId, scope.invoiceId]);
  return invoice;
}

export async function invoiceLines(client: PoolClient, { tenantId, invoiceId }: InvoiceScope) {
  const { rows } = await client.query<InvoiceLine>(`
    SELECT description, quantity, unit_minor AS "unitMinor"
    FROM runline.invoice_lines WHERE tenant_id = $1 AND invoice_id = $2 ORDER BY line_number
  `, [tenantId, invoiceId]);
  return rows;
}

export async function invoiceView(client: PoolClient, tenantId: string, invoice: Invoice) {
  const scope = { tenantId, invoiceId: invoice.id };
  const lines = await invoiceLines(client, scope);
  const { rows } = await client.query<{ kind: DocumentKind }>(`
    SELECT kind FROM runline.billing_documents WHERE tenant_id = $1 AND invoice_id = $2 AND ready_at IS NOT NULL
  `, [tenantId, invoice.id]);
  return { invoice, lines, documents: { invoice: rows.some(({ kind }) => kind === "invoice"),
    receipt: rows.some(({ kind }) => kind === "receipt") } };
}

export async function documentReady(client: PoolClient, { tenantId, invoiceId }: InvoiceScope, kind: DocumentKind) {
  const result = await client.query(`
    SELECT 1 FROM runline.billing_documents
    WHERE tenant_id = $1 AND invoice_id = $2 AND kind = $3 AND ready_at IS NOT NULL
  `, [tenantId, invoiceId, kind]);
  return result.rowCount === 1;
}

export async function readLedger(client: PoolClient, tenantId: string) {
  const { rows: [totals] } = await client.query<{ outstandingMinor: number; settledMinor: number }>(`
    SELECT COALESCE(SUM(total_minor) FILTER (WHERE paid_at IS NULL), 0)::float8 AS "outstandingMinor",
           COALESCE(SUM(total_minor) FILTER (WHERE paid_at IS NOT NULL), 0)::float8 AS "settledMinor"
    FROM runline.invoices WHERE tenant_id = $1
  `, [tenantId]);
  const { rows: entries } = await client.query(`
    SELECT e.invoice_id AS "invoiceId", i.work_order_id AS "jobId", e.event, e.debit_account AS "debitAccount",
           e.credit_account AS "creditAccount", e.amount_minor AS "amountMinor", e.posted_at AS "postedAt"
    FROM runline.ledger_entries e JOIN runline.invoices i ON i.tenant_id = e.tenant_id AND i.id = e.invoice_id
    WHERE e.tenant_id = $1
    ORDER BY e.posted_at DESC, e.invoice_id, e.event LIMIT 100
  `, [tenantId]);
  return { ...totals, entries };
}
