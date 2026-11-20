import { setTimeout as delay } from "node:timers/promises";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import pg from "pg";
import { withTenant } from "./db/tenant-transaction.js";
import { documentReady, invoiceLines, readInvoice, type DocumentKind, type InvoiceScope } from "./features/billing/queries.js";
import { renderPdf } from "./features/billing/render-pdf.js";
import { putDocument } from "./features/billing/storage.js";

type DocumentRequest = InvoiceScope & { kind: DocumentKind };
const queueName = "billing-documents";
const connection = { host: process.env.RUNLINE_REDIS_HOST ?? "127.0.0.1", port: 6379 };
const publisher = new Redis({ ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false });
const consumer = new Redis({ ...connection, maxRetriesPerRequest: null });
const pool = new pg.Pool({ user: "runline_documents", max: 3, connectionTimeoutMillis: 3000 });
pool.on("error", (error) => console.error("Document database connection failed", error));

const queue = new Queue<DocumentRequest>(queueName, {
  connection: publisher,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: true,
  },
});

const worker = new Worker<DocumentRequest>(queueName, async ({ data: scope }) => {
  const { tenantId, invoiceId, kind } = scope;
  const snapshot = await withTenant(pool, scope, async (client) => {
    if (await documentReady(client, scope, kind)) return null;
    const invoice = await readInvoice(client, scope);
    if (!invoice) throw new Error("Document invoice is unavailable");
    return { invoice, lines: await invoiceLines(client, scope) };
  }, true);
  if (!snapshot) return;

  const pdf = await renderPdf(kind, snapshot.invoice, snapshot.lines);
  await putDocument(scope, kind, pdf);
  await withTenant(pool, scope, (client) => client.query(`
    UPDATE runline.billing_documents SET ready_at = now()
    WHERE tenant_id = $1 AND invoice_id = $2 AND kind = $3 AND ready_at IS NULL
  `, [tenantId, invoiceId, kind]));
}, { connection: consumer, concurrency: 2 });

queue.on("error", (error) => console.error("Document queue failed", error.message));
worker.on("error", (error) => console.error("Document worker failed", error.message));
worker.on("failed", (job, error) => console.error("Document generation failed", job?.id, error.message));

const stop = new AbortController();
process.once("SIGINT", () => stop.abort());
process.once("SIGTERM", () => stop.abort());
console.info("Runline document worker started");

try {
  while (!stop.signal.aborted) {
    try {
      const { rows: pending } = await pool.query<DocumentRequest>(`
        SELECT tenant_id AS "tenantId", invoice_id AS "invoiceId", kind
        FROM runline.billing_documents WHERE ready_at IS NULL ORDER BY requested_at, invoice_id LIMIT 50
      `);
      if (pending.length) {
        await queue.addBulk(pending.map((data) => ({
          name: data.kind,
          data,
          opts: { jobId: `${data.kind}-${data.tenantId}-${data.invoiceId}` },
        })));
      }
    } catch (error) {
      console.error("Could not dispatch pending documents", error);
    }
    await delay(2000, undefined, { signal: stop.signal }).catch(() => undefined);
  }
} finally {
  await worker.close();
  await Promise.all([queue.close(), pool.end()]);
  consumer.disconnect();
  publisher.disconnect();
}
