import type { Pool, PoolClient } from "pg";

type TenantContext = { tenantId: string; userId?: string; role?: string; invoiceId?: string; jobId?: string };

export async function withTenant<T>(
  pool: Pool,
  context: TenantContext,
  query: (client: PoolClient) => Promise<T>,
  readSnapshot = false,
): Promise<T> {
  const client = await pool.connect();
  let discardConnection = false;

  try {
    await client.query(readSnapshot ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
    // transaction scope keeps tenant context from leaking when the pool reuses the connection.
    await client.query(`
      SELECT set_config('runline.tenant_id', $1, true),
             set_config('runline.user_id', $2, true),
             set_config('runline.role', $3, true),
             set_config('runline.invoice_id', $4, true),
             set_config('runline.job_id', $5, true),
             set_config('runline.demo_mode', $6, true)
    `, [context.tenantId, context.userId ?? "", context.role ?? "", context.invoiceId ?? "", context.jobId ?? "",
      process.env.RUNLINE_DEMO_MODE === "true" ? "true" : "false"]);
    const result = await query(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discardConnection = true;
    }
    throw error;
  } finally {
    client.release(discardConnection);
  }
}
