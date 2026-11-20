import type { PoolClient } from "pg";
import type { demoTenants } from "../auth/demo-fixtures.js";

type Tenant = (typeof demoTenants)[number];

const catalog = {
  "apex-hvac": [
    { sku: "CAP-45-5", name: "45/5 MFD dual run capacitor", van: 4, warehouse: 20, price: 30000 },
    { sku: "FILTER-1620", name: "16 × 20 in air filter", van: 6, warehouse: 32, price: 30000 },
    { sku: "CONTACTOR-30", name: "30 A contactor", van: 2, warehouse: 14, price: 30000 },
    { sku: "BELT-A42", name: "A42 blower drive belt", van: 2, warehouse: 11, price: 45000 },
    { sku: "THERM-NTC", name: "10 kΩ temperature sensor", van: 3, warehouse: 16, price: 28000 },
    { sku: "DRAIN-TRAP-075", name: "3/4 in condensate trap", van: 1, warehouse: 8, price: 32000 },
    { sku: "RELAY-24V", name: "24 V control relay", van: 0, warehouse: 7, price: 52000 },
  ],
  "metro-plumbing": [
    { sku: "VALVE-075", name: "3/4 in copper ball valve", van: 4, warehouse: 18, price: 30000 },
    { sku: "SEAL-050", name: "1/2 in compression seal", van: 7, warehouse: 28, price: 30000 },
    { sku: "ANGLE-STOP-050", name: "1/2 in angle stop valve", van: 2, warehouse: 12, price: 39000 },
    { sku: "FLEX-450", name: "450 mm braided supply hose", van: 3, warehouse: 18, price: 24000 },
    { sku: "PTRAP-150", name: "1 1/2 in sink P-trap", van: 1, warehouse: 9, price: 41000 },
    { sku: "FLAPPER-2", name: "2 in cistern flapper", van: 3, warehouse: 14, price: 19000 },
    { sku: "GAUGE-100", name: "100 PSI water pressure gauge", van: 0, warehouse: 4, price: 65000 },
  ],
};

export async function seedDemoInventory(client: Pick<PoolClient, "query">, tenant: Tenant) {
  for (const part of catalog[tenant.slug]) {
    await client.query(`
      INSERT INTO runline.inventory_parts (tenant_id, sku, name, unit_price_minor)
      VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
    `, [tenant.id, part.sku, part.name, part.price]);
  }

  const locations = [
    { name: "Main warehouse", kind: "WAREHOUSE", technicianId: null },
    ...[tenant.accounts.TECHNICIAN, ...tenant.extraTechnicians].map(({ id, name }, index) => ({
      name: `Van ${101 + index} (${name})`, kind: "VAN", technicianId: id,
    })),
  ];
  for (const location of locations) {
    await client.query(`
      INSERT INTO runline.inventory_locations (tenant_id, name, kind, technician_id)
      VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
    `, [tenant.id, location.name, location.kind, location.technicianId]);
    for (const part of catalog[tenant.slug]) {
      await client.query(`
        INSERT INTO runline.inventory_stock (tenant_id, location_id, sku, quantity)
        SELECT tenant_id, id, $3, $4 FROM runline.inventory_locations
        WHERE tenant_id = $1 AND technician_id IS NOT DISTINCT FROM $2::uuid
        ON CONFLICT DO NOTHING
      `, [tenant.id, location.technicianId, part.sku, location.kind === "VAN" ? part.van : part.warehouse]);
    }
  }
}
