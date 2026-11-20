import Dexie, { type EntityTable } from "dexie";
import { nextStep, type FieldChange, type FieldDay, type FieldManifest, type FieldMutation, type FieldProfile, type MutationOutcome, type StockPart } from "./types";

type ActiveRoute = { key: "active"; scope: string; date: string };
type FieldCache = { scope: string; profile: FieldProfile; days: Record<string, FieldDay>; stock: StockPart[] };
type QueuedMutation = { order: number; scope: string; mutation: FieldMutation; rejection?: string };

const db = new Dexie("runline-field") as Dexie & {
  routes: EntityTable<FieldCache, "scope">;
  session: EntityTable<ActiveRoute, "key">;
  outbox: EntityTable<QueuedMutation, "order">;
};
db.version(1).stores({ routes: "scope", session: "key", outbox: "++order, scope" });

export function scopeOf(profile: FieldProfile) {
  const scope = `${profile.tenantId}:${profile.userId}`;
  return profile.datasetId ? `${scope}:${profile.datasetId}` : scope;
}

function entriesFor(scope: string) {
  return db.outbox.where("scope").equals(scope).sortBy("order");
}

export function getActiveRoute() {
  return db.session.get("active");
}

export async function clearActiveRoute() {
  await db.transaction("rw", db.session, db.routes, db.outbox, async () => {
    const active = await getActiveRoute();
    if (!active) return;
    await db.session.delete("active");
    if (!(await db.outbox.where("scope").equals(active.scope).count())) await db.routes.delete(active.scope);
  });
}

export async function saveManifest(manifest: FieldManifest, activate = true) {
  const { profile, stock, ...day } = manifest;
  const scope = scopeOf(profile);
  return db.transaction("rw", db.routes, db.session, db.outbox, async () => {
    if (!activate && (await getActiveRoute())?.scope !== scope) return;
    const saved = await db.routes.get(scope);
    const hasQueuedEdits = !!saved && (await db.outbox.where("scope").equals(scope).count()) > 0;
    const days = { ...saved?.days };

    // keep the last confirmed baseline until the server has acknowledged queued edits.
    if (!hasQueuedEdits || !days[day.date]) days[day.date] = day;
    await db.routes.put({ scope, profile, days, stock: hasQueuedEdits ? saved.stock : stock });
    if (activate) await db.session.put({ key: "active", scope, date: day.date });
  });
}

function apply(cache: FieldCache, mutation: FieldMutation, remaining?: number) {
  const part = mutation.type === "part" ? cache.stock.find(({ sku }) => sku === mutation.sku) : undefined;
  if (mutation.type === "part" && part) part.quantity = remaining ?? Math.max(0, part.quantity - mutation.quantity);

  for (const day of Object.values(cache.days)) {
    const item = day.jobs.find(({ job }) => job.id === mutation.jobId);
    if (!item) continue;

    if (mutation.type === "status" && item.job.version <= mutation.version) {
      item.job.status = mutation.status;
      item.job.version = mutation.version + 1;
    } else if (mutation.type === "checklist") {
      item.checklist[mutation.item] = mutation.checked;
    } else if (mutation.type === "part" && !item.parts.some(({ id }) => id === mutation.id)) {
      item.parts.push({ id: mutation.id, sku: mutation.sku, name: part?.name ?? mutation.sku, quantity: mutation.quantity });
    }
  }
}

function project(cache: FieldCache, entries: QueuedMutation[]) {
  for (const entry of entries) {
    if (entry.rejection) break;
    apply(cache, entry.mutation);
  }
  return cache;
}

export async function readFieldView(date?: string, expectedScope?: string) {
  return db.transaction("r", db.routes, db.session, db.outbox, async () => {
    const active = await getActiveRoute();
    if (!active || (expectedScope && active.scope !== expectedScope)) return null;
    const cache = await db.routes.get(active.scope);
    if (!cache) return null;
    const entries = await entriesFor(active.scope);
    const view = project(cache, entries);

    return {
      scope: active.scope, profile: view.profile, stock: view.stock,
      day: view.days[date ?? active.date], pending: entries.length,
      conflict: entries.find((entry) => entry.rejection),
    };
  });
}

export async function queueChange(scope: string, date: string, jobId: string, change: FieldChange) {
  await db.transaction("rw", db.routes, db.session, db.outbox, async () => {
    const active = await getActiveRoute();
    if (active?.scope !== scope) throw new Error("This technician's route is no longer active.");
    const cache = await db.routes.get(scope);
    if (!cache) throw new Error("Download your route before recording a change.");
    const entries = await entriesFor(scope);
    if (entries.some((entry) => entry.rejection)) throw new Error("Review the rejected change before recording more work.");

    // the outbox entry stores the edit itself and the ordering used to replay it.
    const projected = project(cache, entries);
    const fieldJob = projected.days[date]?.jobs.find(({ job }) => job.id === jobId);
    if (!fieldJob) throw new Error("This work order has not been downloaded.");

    const { job } = fieldJob;
    if (change.type === "status") {
      if (job.version !== change.version || nextStep[job.status]?.status !== change.status) {
        throw new Error("The work order changed. Review its current status.");
      }
    } else if (job.status !== "ARRIVED") {
      throw new Error("Mark arrival before recording parts or checklist changes.");
    }
    if (change.type === "part" && (projected.stock.find(({ sku }) => sku === change.sku)?.quantity ?? 0) < change.quantity) {
      throw new Error("There is not enough stock in the van.");
    }

    await db.outbox.add({ scope, mutation: { ...change, id: crypto.randomUUID(), jobId } });
  });
}

export async function nextQueuedChange(scope: string) {
  if ((await getActiveRoute())?.scope !== scope) return;
  const [entry] = await entriesFor(scope);
  return entry?.rejection ? undefined : entry;
}

export async function acknowledgeChange(entry: QueuedMutation, outcome: Exclude<MutationOutcome, { state: "blocked" }>) {
  await db.transaction("rw", db.routes, db.outbox, async () => {
    const queued = await db.outbox.get(entry.order);
    if (queued?.mutation.id !== outcome.id || queued.rejection) return;
    const cache = await db.routes.get(entry.scope);
    if (!cache) throw new Error("The downloaded route is missing");

    if (outcome.state === "applied") {
      apply(cache, queued.mutation, outcome.remaining);
      await db.routes.put(cache);
      await db.outbox.delete(entry.order);
      return;
    }

    if (queued.mutation.type === "part" && outcome.remaining !== undefined) {
      const { sku } = queued.mutation;
      const part = cache.stock.find((row) => row.sku === sku);
      if (part) {
        part.quantity = outcome.remaining;
        await db.routes.put(cache);
      }
    }
    await db.outbox.update(entry.order, { rejection: outcome.message });
  });
}

export async function discardRejectedChange(scope: string, order: number) {
  await db.transaction("rw", db.outbox, db.session, async () => {
    const active = await getActiveRoute();
    const entry = await db.outbox.get(order);
    if (active?.scope === scope && entry?.scope === scope && entry.rejection) await db.outbox.delete(order);
  });
}
