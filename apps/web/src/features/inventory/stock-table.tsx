"use client";

import Link from "next/link";
import { useSnapshotStream } from "../../hooks/use-snapshot-stream";

type StockRow = { sku: string; name: string; quantity: number; locationId: string; locationName: string };
export type InventorySnapshot = { stock: StockRow[] };

export function StockTable({ initial }: { initial: InventorySnapshot }) {
  const { snapshot, connection } = useSnapshotStream<InventorySnapshot>("/api/inventory/stream");
  const { stock } = snapshot ?? initial;
  const locations = new Map<string, string>();
  const parts = new Map<string, { name: string; quantities: Map<string, number> }>();

  for (const row of stock) {
    locations.set(row.locationId, row.locationName);
    const part = parts.get(row.sku) ?? { name: row.name, quantities: new Map<string, number>() };
    part.quantities.set(row.locationId, row.quantity);
    parts.set(row.sku, part);
  }

  if (connection === "expired") {
    return <p role="status" className="text-sm text-neutral-600"><Link href="/login" className="underline">Sign in again</Link> to see stock.</p>;
  }

  return (
    <>
      {connection === "reconnecting" && <p role="status" className="text-sm text-amber-900">Reconnecting to stock updates…</p>}
      {connection === "unavailable" && <p role="status" className="text-sm text-amber-900">Live stock updates are unavailable. Reload to reconnect.</p>}
      {parts.size ? <div className="overflow-x-auto border-y border-neutral-200" tabIndex={0} role="region" aria-label="Warehouse and van stock">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-600">
            <tr>
              <th scope="col" className="px-4 py-3">Part</th>
              {Array.from(locations, ([id, name]) => <th key={id} scope="col" className="px-4 py-3 text-right">{name}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from(parts, ([sku, part]) => <tr key={sku} className="border-t border-neutral-200 hover:bg-neutral-50/80">
              <th scope="row" className="px-4 py-3 font-semibold">{part.name}<span className="block text-xs font-normal text-neutral-600">{sku}</span></th>
              {Array.from(locations.keys(), (id) => <td key={id} className="px-4 py-3 text-right tabular-nums">{part.quantities.get(id) ?? 0}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div> : <p className="text-sm text-neutral-600">No inventory has been recorded.</p>}
    </>
  );
}
