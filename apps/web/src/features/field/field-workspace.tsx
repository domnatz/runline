"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { dateQuery } from "../jobs/format";
import { ShareLocation } from "../tracking/share-location";
import { Brand } from "../workspace/brand";
import { JobEditor } from "./job-editor";
import { RouteList } from "./route-list";
import { discardRejectedChange, queueChange, readFieldView, saveManifest, scopeOf } from "./storage";
import { FieldSessionExpired, flushFieldQueue } from "./sync";
import type { FieldChange, FieldManifest } from "./types";
import { prepareOfflineShell, scheduleBackgroundSync } from "./worker-client";

function subscribeToNetwork(change: () => void) {
  window.addEventListener("online", change);
  window.addEventListener("offline", change);
  return () => {
    window.removeEventListener("online", change);
    window.removeEventListener("offline", change);
  };
}

export function FieldWorkspace({ initial, date, jobId }: { initial?: FieldManifest; date?: string; jobId?: string }) {
  const requestedDate = initial?.date ?? date;
  const scope = initial ? scopeOf(initial.profile) : undefined;
  const view = useLiveQuery(() => readFieldView(requestedDate, scope).catch(() => null), [requestedDate, scope]);
  const online = useSyncExternalStore(subscribeToNetwork, () => navigator.onLine, () => true);
  const [ready, setReady] = useState(!initial);
  const [preparationFailed, setPreparationFailed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const rerun = useRef(false);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return;
    if (running.current) {
      rerun.current = true;
      return;
    }

    running.current = true;
    setSyncing(true);
    setError("");
    try {
      do {
        rerun.current = false;
        await flushFieldQueue(requestedDate);
      } while (rerun.current && navigator.onLine);
      setSessionExpired(false);
    } catch (error) {
      if (error instanceof FieldSessionExpired) setSessionExpired(true);
      else if (navigator.onLine) setError("Could not sync saved work. Try again.");
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [requestedDate]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        if (initial) {
          await saveManifest(initial);
          const saved = await prepareOfflineShell();
          if (active) {
            setReady(saved);
            setPreparationFailed(!saved);
          }
        }
        if (active && navigator.onLine && (!initial || (await readFieldView(requestedDate, scope))?.pending)) void syncNow();
      } catch {
        if (active) setPreparationFailed(true);
      }
    }

    function reconnect() { void syncNow(); }
    void initialize();
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    return () => {
      active = false;
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
    };
  }, [initial, requestedDate, scope, syncNow]);

  async function record(change: FieldChange) {
    if (!view?.day || !jobId) return;
    setError("");
    try {
      await queueChange(view.scope, view.day.date, jobId, change);
      if (change.type === "status" && change.status === "COMPLETED") toast.success("Completion saved on this device.");
      if (navigator.onLine) void syncNow();
      else void scheduleBackgroundSync().catch(() => undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the technician update.");
    }
  }

  async function discardConflict() {
    if (!view?.conflict) return;
    await discardRejectedChange(view.scope, view.conflict.order);
    if (navigator.onLine) void syncNow();
    else void scheduleBackgroundSync().catch(() => undefined);
  }

  const day = view?.day ?? (view === undefined ? initial : undefined);
  const profile = view?.profile ?? (view === undefined ? initial?.profile : undefined);
  const job = day?.jobs.find((entry) => entry.job.id === jobId);
  const pending = view?.pending ?? 0;
  const queued = `${pending} ${pending === 1 ? "change" : "changes"} queued`;
  const status = view?.conflict ? "Action needed" : !online ? `Offline · ${queued}`
    : syncing ? "Syncing" : pending ? `Online · ${queued}` : "Online · Synced";
  const healthy = online && !view?.conflict;

  return (
    <main className="rl-page max-w-2xl space-y-4">
      {!initial && profile && <header className="flex items-center justify-between gap-3 border-b border-neutral-200 pb-3">
        <Brand />
        <p className="text-right text-xs text-neutral-600">{profile.tenantName} · {profile.userName}</p>
      </header>}
      <section aria-label="Technician sync" className="space-y-2 border-b border-neutral-200 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className={healthy ? "text-green-800" : "text-amber-900"}>
              {online ? <Wifi size={17} /> : <WifiOff size={17} />}
            </span>
            <div>
              <p role="status" className={`text-sm font-semibold ${healthy ? "text-green-800" : "text-amber-900"}`}>{status}</p>
              {view && ready && <p className="text-xs text-neutral-600">Saved for offline</p>}
            </div>
          </div>
          {online && pending > 0 && !view?.conflict && !sessionExpired && <button type="button" disabled={syncing}
            onClick={() => void syncNow()} className="rl-button min-h-11 text-neutral-900">
            Retry sync
          </button>}
        </div>
        {sessionExpired && <p className="text-sm text-amber-900"><a className="font-semibold underline" href="/login">Sign in again</a> to sync saved work.</p>}
        {preparationFailed && <p className="text-xs text-amber-900">Offline reload is unavailable. Reopen the route while connected to try again.</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {view?.conflict && <div className="border-l-2 border-amber-700 py-2 pl-3 text-sm text-amber-950">
          <p role="alert">{view.conflict.rejection}</p>
          <p className="mt-1 text-xs">Later changes are held until you review this update.</p>
          <button type="button" onClick={() => void discardConflict().catch(() => setError("Could not clear the rejected update."))}
            className="mt-2 min-h-11 font-semibold underline">Discard rejected change and continue</button>
        </div>}
      </section>
      {day ? jobId ? (
        <>
          <a href={`/tech${dateQuery(day.date)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-900 hover:underline">
            <ArrowLeft size={15} aria-hidden="true" />Back to my route
          </a>
          {online && !pending && !view?.conflict && !sessionExpired && job?.job.status === "EN_ROUTE" && (
            <ShareLocation key={jobId} jobId={jobId} onArrival={syncNow} />
          )}
          {job ? <JobEditor fieldJob={job} timeZone={day.timeZone} stock={view?.stock ?? initial?.stock ?? []}
            disabled={!view || !!view.conflict} submit={record} />
            : <p className="rl-panel p-5 text-sm text-neutral-600">This work order is unavailable in the saved route.</p>}
        </>
      ) : <RouteList day={day} /> : (
        <p className="rl-panel p-5 text-sm text-neutral-600">
          {view === undefined ? "Opening the saved route…" : "This route is not downloaded. Open your technician route while connected."}
        </p>
      )}
    </main>
  );
}
