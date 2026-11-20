import type { Metadata } from "next";
import { Suspense } from "react";
import { OfflineEntry } from "../../features/field/offline-entry";

export const metadata: Metadata = { title: "Saved technician route" };

export default function OfflinePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-lg px-4 py-7 text-sm text-neutral-600">Opening the saved route…</main>}>
      <OfflineEntry />
    </Suspense>
  );
}
