import { Router, type Response } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant } from "../../db/tenant-transaction.js";
import { HttpError } from "../../http-error.js";
import { authorize } from "../auth/authorize.js";
import { demoTenants } from "../auth/demo-fixtures.js";
import { idempotencyKey } from "../field/contracts.js";
import { demoBillingJobs } from "../jobs/demo-fixtures.js";
import { checkoutInput, settleInvoice } from "./checkout.js";
import { createCustomerLink, customerScope } from "./customer-link.js";
import { documentReady, invoiceByJob, invoiceView, readInvoice, readLedger, type DocumentKind, type InvoiceScope } from "./queries.js";
import { getDocument } from "./storage.js";

const uuid = z.uuid();
const documentKind = z.enum(["invoice", "receipt"]);
const demoLinkInput = z.strictObject({ tenantSlug: z.string() });

function parseId(value: unknown) {
  const id = uuid.safeParse(value);
  if (!id.success) throw new HttpError(404, "Record not found");
  return id.data;
}

async function download(response: Response, scope: InvoiceScope, kind: DocumentKind, ready: boolean) {
  if (!ready) throw new HttpError(404, "This PDF is not ready yet");
  const pdf = await getDocument(scope, kind).catch(() => {
    throw new HttpError(503, "The PDF is temporarily unavailable. Try again shortly.");
  });
  response.attachment(`runline-${kind}-${scope.invoiceId}.pdf`).send(pdf);
}

export function billingRoutes(pool: Pool, sessionKey: Uint8Array, demoMode: boolean) {
  const router = Router();
  const staff = ["ADMIN", "DISPATCHER"] as const;
  const authorized = authorize(pool, sessionKey);

  async function customerInvoiceScope(token: unknown) {
    const scope = await customerScope(token, sessionKey);
    if (scope.invoiceId !== undefined) return { tenantId: scope.tenantId, invoiceId: scope.invoiceId, role: scope.role };
    const { tenantId, jobId, role } = scope;
    const invoice = await withTenant(pool, scope, (client) => invoiceByJob(client, tenantId, jobId), true);
    if (!invoice) throw new HttpError(404, "Invoice not found");
    return { tenantId, invoiceId: invoice.id, role };
  }

  router.get("/billing/jobs/:id", authorized(async (request, response, session) => {
    const jobId = parseId(request.params.id);
    const result = await withTenant(pool, session, async (client) => {
      const invoice = await invoiceByJob(client, session.tenantId, jobId);
      return invoice ? invoiceView(client, session.tenantId, invoice) : null;
    }, true);
    response.json({ billing: result });
  }, [...staff]));

  router.post("/billing/invoices/:id/link", authorized(async (request, response, session) => {
    const scope = { tenantId: session.tenantId, invoiceId: parseId(request.params.id) };
    const invoice = await withTenant(pool, session, (client) => readInvoice(client, scope), true);
    if (!invoice) throw new HttpError(404, "Invoice not found");
    response.json(await createCustomerLink(scope, sessionKey));
  }, [...staff]));

  router.get("/billing/invoices/:id/documents/:kind", authorized(async (request, response, session) => {
    const scope = { tenantId: session.tenantId, invoiceId: parseId(request.params.id) };
    const kind = documentKind.safeParse(request.params.kind);
    if (!kind.success) throw new HttpError(404, "Document not found");
    const ready = await withTenant(pool, session, (client) => documentReady(client, scope, kind.data), true);
    await download(response, scope, kind.data, ready);
  }, [...staff]));

  router.get("/billing/ledger", authorized(async (_request, response, session) => {
    response.json(await withTenant(pool, session, (client) => readLedger(client, session.tenantId), true));
  }, ["ADMIN"]));

  router.post("/demo/customer-link", async (request, response) => {
    if (!demoMode) throw new HttpError(404, "Customer tracking is unavailable");
    const input = demoLinkInput.safeParse(request.body);
    const tenant = input.success ? demoTenants.find(({ slug }) => slug === input.data.tenantSlug) : undefined;
    if (!tenant) throw new HttpError(400, "Choose a valid organization");
    const tenantId = tenant.id;
    const invoice = await withTenant(pool, { tenantId, role: "ADMIN" },
      (client) => invoiceByJob(client, tenantId, demoBillingJobs[tenant.slug]), true);
    if (!invoice) throw new HttpError(404, "The invoice is unavailable");
    response.json(await createCustomerLink({ tenantId, invoiceId: invoice.id }, sessionKey));
  });

  router.use("/customer", (_request, response, next) => {
    response.set({ "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" });
    next();
  });

  router.get("/customer/:token", async (request, response) => {
    const scope = await customerInvoiceScope(request.params.token);
    const view = await withTenant(pool, scope, async (client) => {
      const invoice = await readInvoice(client, scope);
      if (!invoice) throw new HttpError(404, "Invoice not found");
      return invoiceView(client, scope.tenantId, invoice);
    }, true);
    response.json(view);
  });

  router.post("/customer/:token/checkout", async (request, response) => {
    const scope = await customerInvoiceScope(request.params.token);
    const input = checkoutInput.safeParse(request.body);
    const key = idempotencyKey.safeParse(request.get("Idempotency-Key"));
    if (!input.success || !key.success) throw new HttpError(400, "Choose a scenario and supply a payment key");
    const { outcome, timeout } = await withTenant(pool, scope, (client) => settleInvoice(client, scope, key.data, input.data.scenario));
    if (timeout) throw new HttpError(504, "Checkout timed out. Retry this payment to recover its result.");
    response.json({ outcome });
  });

  router.get("/customer/:token/documents/:kind", async (request, response) => {
    const scope = await customerInvoiceScope(request.params.token);
    const kind = documentKind.safeParse(request.params.kind);
    if (!kind.success) throw new HttpError(404, "Document not found");
    const ready = await withTenant(pool, scope, (client) => documentReady(client, scope, kind.data), true);
    await download(response, scope, kind.data, ready);
  });

  return router;
}
