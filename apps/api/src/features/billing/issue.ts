import type { PoolClient } from "pg";
import type { InvoiceLine } from "./queries.js";

export async function issueInvoice(client: Pick<PoolClient, "query">, tenantId: string, jobId: string) {
  const { rows: [job] } = await client.query<{
    tenantName: string; title: string; customerName: string; address: string; laborMinor: number;
  }>(`
    SELECT t.name AS "tenantName", j.title, j.customer_name AS "customerName", j.address,
           t.labor_price_minor AS "laborMinor"
    FROM runline.work_orders j JOIN runline.tenants t ON t.id = j.tenant_id
    WHERE j.tenant_id = $1 AND j.id = $2 AND j.status = 'COMPLETED'
  `, [tenantId, jobId]);
  if (!job) throw new Error("Invoice requires a completed work order");

  const { rows: parts } = await client.query<InvoiceLine>(`
    SELECT p.name AS description, SUM(jp.quantity)::integer AS quantity, p.unit_price_minor AS "unitMinor"
    FROM runline.job_parts jp JOIN runline.inventory_parts p ON p.tenant_id = jp.tenant_id AND p.sku = jp.sku
    WHERE jp.tenant_id = $1 AND jp.work_order_id = $2
    GROUP BY p.sku, p.name, p.unit_price_minor
    ORDER BY p.sku
  `, [tenantId, jobId]);
  const lines = [{ description: "Service labor", quantity: 1, unitMinor: job.laborMinor }, ...parts];
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitMinor, 0);
  const { rows: [invoice] } = await client.query<{ id: string }>(`
    INSERT INTO runline.invoices (tenant_id, work_order_id, tenant_name, job_title, customer_name, address, currency, total_minor)
    VALUES ($1, $2, $3, $4, $5, $6, 'PHP', $7)
    ON CONFLICT (tenant_id, work_order_id) DO NOTHING RETURNING id
  `, [tenantId, jobId, job.tenantName, job.title, job.customerName, job.address, total]);
  if (!invoice) return;

  await client.query(`
    INSERT INTO runline.invoice_lines (tenant_id, invoice_id, line_number, description, quantity, unit_minor)
    SELECT $1, $2, ordinal::int, description, quantity, unit_minor
    FROM unnest($3::text[], $4::integer[], $5::integer[])
      WITH ORDINALITY AS lines(description, quantity, unit_minor, ordinal)
  `, [tenantId, invoice.id, lines.map((line) => line.description),
    lines.map((line) => line.quantity), lines.map((line) => line.unitMinor)]);
  await client.query(`
    INSERT INTO runline.ledger_entries (tenant_id, invoice_id, event, debit_account, credit_account, amount_minor)
    VALUES ($1, $2, 'ISSUED', 'RECEIVABLES', 'SERVICE_REVENUE', $3)
  `, [tenantId, invoice.id, total]);
  await client.query("INSERT INTO runline.billing_documents (tenant_id, invoice_id, kind) VALUES ($1, $2, 'invoice')", [
    tenantId, invoice.id,
  ]);
}
