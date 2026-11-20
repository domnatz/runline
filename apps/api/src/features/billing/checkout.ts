import type { PoolClient } from "pg";
import { z } from "zod";
import { HttpError } from "../../http-error.js";
import { readInvoice, type InvoiceScope } from "./queries.js";

export const checkoutInput = z.strictObject({ scenario: z.enum(["success", "decline", "timeout"]) });
type Scenario = z.infer<typeof checkoutInput>["scenario"];
type Outcome = "PAID" | "DECLINED";

export async function settleInvoice(client: PoolClient, scope: InvoiceScope, key: string, scenario: Scenario) {
  const invoice = await readInvoice(client, scope, true);
  if (!invoice) throw new HttpError(404, "Invoice not found");
  const { tenantId, invoiceId } = scope;
  const { rows: [attempt] } = await client.query<{ scenario: Scenario; outcome: Outcome }>(`
    SELECT scenario, outcome FROM runline.payment_attempts
    WHERE tenant_id = $1 AND invoice_id = $2 AND idempotency_key = $3
  `, [tenantId, invoiceId, key]);
  if (attempt) {
    if (attempt.scenario !== scenario) throw new HttpError(409, "Use a new payment key for a different scenario");
    return { outcome: attempt.outcome, timeout: false };
  }

  const shouldSettle = !invoice.paidAt && scenario !== "decline";
  if (shouldSettle) {
    await client.query("UPDATE runline.invoices SET paid_at = clock_timestamp() WHERE tenant_id = $1 AND id = $2", [
      tenantId, invoiceId,
    ]);
    await client.query(`
      INSERT INTO runline.ledger_entries (tenant_id, invoice_id, event, debit_account, credit_account, amount_minor, posted_at)
      VALUES ($1, $2, 'SETTLED', 'DEMO_CLEARING', 'RECEIVABLES', $3, clock_timestamp())
    `, [tenantId, invoiceId, invoice.totalMinor]);
    await client.query("INSERT INTO runline.billing_documents (tenant_id, invoice_id, kind) VALUES ($1, $2, 'receipt')", [
      tenantId, invoiceId,
    ]);
  }

  const outcome: Outcome = invoice.paidAt || shouldSettle ? "PAID" : "DECLINED";
  await client.query(`
    INSERT INTO runline.payment_attempts (tenant_id, invoice_id, idempotency_key, scenario, outcome)
    VALUES ($1, $2, $3, $4, $5)
  `, [tenantId, invoiceId, key, scenario, outcome]);
  return { outcome, timeout: shouldSettle && scenario === "timeout" };
}
