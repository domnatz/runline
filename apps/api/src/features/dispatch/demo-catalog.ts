import type { PoolClient } from "pg";
import type { demoTenants } from "../auth/demo-fixtures.js";

type DemoTenant = (typeof demoTenants)[number];
const catalog = {
  "apex-hvac": [
    { skills: ["EPA-608", "REFRIGERATION"], latitude: 14.547, longitude: 121.012 },
    { skills: ["THERMOSTATS"], latitude: 14.558, longitude: 121.026 },
    { skills: ["DUCTWORK", "AIRFLOW"], latitude: 14.573, longitude: 121.036 },
  ],
  "metro-plumbing": [
    { skills: ["MASTER-PLUMBER", "WATER-LINES"], latitude: 14.565, longitude: 121.029 },
    { skills: ["DRAIN-SERVICE"], latitude: 14.548, longitude: 121.012 },
    { skills: ["FIXTURE-SERVICE", "LEAK-DETECTION"], latitude: 14.559, longitude: 121.018 },
  ],
} as const;

export async function seedDispatchCatalog(client: Pick<PoolClient, "query">, tenant: DemoTenant) {
  const [primary, extra, specialist] = catalog[tenant.slug];
  for (const [id, { skills, longitude, latitude }] of [
    [tenant.accounts.TECHNICIAN.id, primary],
    [tenant.extraTechnicians[0].id, extra],
    [tenant.extraTechnicians[1].id, specialist],
  ] as const) {
    await client.query(`
      UPDATE runline.tenant_members
      SET skills = CASE WHEN cardinality(skills) = 0 THEN $3 ELSE skills END,
          base_position = COALESCE(base_position, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)
      WHERE tenant_id = $1 AND id = $2
    `, [tenant.id, id, skills, longitude, latitude]);
  }
}
