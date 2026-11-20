import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { demoTenants } from "./features/auth/demo-fixtures.js";
import { issueInvoice } from "./features/billing/issue.js";
import { seedDispatchCatalog } from "./features/dispatch/demo-catalog.js";
import { seedDemoInventory } from "./features/field/demo-inventory.js";
import { seedDemoJobs } from "./features/jobs/demo-fixtures.js";

const migrations = new URL("../db/migrations/", import.meta.url);

async function migrate() {
  const client = new pg.Client();
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(870905274)");

    for (const [name, variable] of [
      ["runline_app", "RUNLINE_APP_PASSWORD"],
      ["runline_documents", "RUNLINE_DOCUMENTS_PASSWORD"],
    ] as const) {
      const password = process.env[variable];
      if (!password) throw new Error(`${variable} is required to provision ${name}`);
      const identifier = client.escapeIdentifier(name);
      const role = await client.query<{ restricted: boolean }>(`
        SELECT rolcanlogin AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole) AS restricted
        FROM pg_roles WHERE rolname = $1
      `, [name]);
      if (!role.rowCount) {
        await client.query(`CREATE ROLE ${identifier} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
      } else if (!role.rows[0]?.restricted) {
        throw new Error(`The existing ${name} role must have restricted login privileges`);
      }
      await client.query(`ALTER ROLE ${identifier} PASSWORD ${client.escapeLiteral(password)}`);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.runline_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrations)).filter((file) => /^\d{3}_.+\.sql$/.test(file)).sort();
    const history = await client.query<{ filename: string; checksum: string }>(
      "SELECT filename, checksum FROM public.runline_migrations ORDER BY filename",
    );

    for (const [index, applied] of history.rows.entries()) {
      if (applied.filename !== files[index]) {
        throw new Error(`Migration history differs at ${applied.filename}`);
      }
      const sql = await readFile(new URL(applied.filename, migrations), "utf8");
      if (createHash("sha256").update(sql).digest("hex") !== applied.checksum) {
        throw new Error(`Applied migration changed: ${applied.filename}`);
      }
    }

    for (const file of files.slice(history.rows.length)) {
      const sql = await readFile(new URL(file, migrations), "utf8");
      await client.query(sql);
      const checksum = createHash("sha256").update(sql).digest("hex");
      await client.query("INSERT INTO public.runline_migrations (filename, checksum) VALUES ($1, $2)", [file, checksum]);
      console.info(`Applied ${file}`);
    }

    if (process.env.RUNLINE_DEMO_MODE === "true") {
      for (const tenant of demoTenants) {
        await client.query(
          "INSERT INTO runline.tenants (id, slug, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
          [tenant.id, tenant.slug, tenant.name],
        );
        const accounts = [
          ...Object.entries(tenant.accounts),
          ...tenant.extraTechnicians.map((technician) => ["TECHNICIAN", technician] as const),
        ];
        for (const [role, account] of accounts) {
          await client.query(
            `INSERT INTO runline.tenant_members (tenant_id, id, name, email, role)
             VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tenant_id, id) DO NOTHING`,
            [tenant.id, account.id, account.name, account.email, role],
          );
        }
        await seedDispatchCatalog(client, tenant);
        await seedDemoJobs(client, tenant);
        await seedDemoInventory(client, tenant);
        await client.query(`
          INSERT INTO runline.notifications (tenant_id, work_order_id, version, kind, created_at)
          SELECT e.tenant_id, e.work_order_id, e.version, runline.notification_kind(e.action, e.status), e.occurred_at
          FROM runline.work_order_events e WHERE e.tenant_id = $1 AND runline.notification_kind(e.action, e.status) IS NOT NULL
          ON CONFLICT (tenant_id, work_order_id, version) DO NOTHING
        `, [tenant.id]);
      }
      console.info("Seeded organizations are ready");
    }

    const { rows: unbilled } = await client.query<{ tenantId: string; id: string }>(`
      SELECT j.tenant_id AS "tenantId", j.id FROM runline.work_orders j WHERE j.status = 'COMPLETED'
      AND NOT EXISTS (SELECT 1 FROM runline.invoices i WHERE i.tenant_id = j.tenant_id AND i.work_order_id = j.id)
    `);
    for (const job of unbilled) await issueInvoice(client, job.tenantId, job.id);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await migrate();
