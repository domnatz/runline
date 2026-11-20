import { acknowledgeChange, getActiveRoute, nextQueuedChange, saveManifest, scopeOf } from "./storage";
import type { FieldManifest, MutationOutcome } from "./types";

export const syncTag = "runline-field-sync";

export class FieldSessionExpired extends Error {}

export function flushFieldQueue(date?: string) {
  return navigator.locks ? navigator.locks.request(syncTag, () => drainFieldQueue(date)) : drainFieldQueue(date);
}

async function drainFieldQueue(date?: string) {
  const active = await getActiveRoute();
  if (!active) return;
  const [tenantId, userId, datasetId] = active.scope.split(":");

  for (let entry = await nextQueuedChange(active.scope); entry; entry = await nextQueuedChange(active.scope)) {
    const response = await fetch("/api/sync/batch", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", "idempotency-key": entry.mutation.id },
      body: JSON.stringify({ tenantId, userId, datasetId, mutations: [entry.mutation] }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401 || response.status === 403) throw new FieldSessionExpired("Sign in again to sync saved work.");
    if (!response.ok) throw new Error("Could not sync saved work. Try again.");

    const { outcomes }: { outcomes: MutationOutcome[] } = await response.json();
    const outcome = outcomes[0];
    if (!outcome || outcome.id !== entry.mutation.id || outcome.state === "blocked") {
      throw new Error("Runline could not confirm the saved change. Try again.");
    }
    await acknowledgeChange(entry, outcome);
    if (outcome.state === "rejected") return;
  }

  const current = await getActiveRoute();
  if (current?.scope !== active.scope) return;
  const query = new URLSearchParams({ date: date ?? current.date });
  const response = await fetch(`/api/tech/manifest?${query}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (response.status === 401 || response.status === 403) throw new FieldSessionExpired("Sign in again to sync saved work.");
  if (!response.ok) return;
  const manifest: FieldManifest = await response.json();
  if (scopeOf(manifest.profile) === active.scope) await saveManifest(manifest, false);
}
