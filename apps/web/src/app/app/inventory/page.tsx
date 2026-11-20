import type { Metadata } from "next";
import { getWorkspaceData } from "../../../features/auth/server-api";
import { StockTable, type InventorySnapshot } from "../../../features/inventory/stock-table";
import { PageHeading } from "../../../features/workspace/page-heading";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const inventory = await getWorkspaceData<InventorySnapshot>("/api/inventory", "/tech");
  return (
    <main className="rl-page space-y-5">
      <PageHeading title="Inventory" />
      <StockTable initial={inventory} />
    </main>
  );
}
