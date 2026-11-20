"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useSnapshotStream } from "../../hooks/use-snapshot-stream";
import { useJobSelection } from "../dispatch/selection";
import type { Job } from "../jobs/types";
import { LocationsMap } from "./locations-map";
import { TripSummary } from "./trip-summary";
import type { DispatchTrackingSnapshot } from "./types";

function revision(jobs: DispatchTrackingSnapshot["jobs"]) {
  return jobs.map(({ id, version }) => `${id}:${version}`).sort().join(",");
}

export function DispatchLive({ date, jobs, revealWorkOrder }: { date: string; jobs: Job[]; revealWorkOrder: () => void }) {
  const router = useRouter();
  const selectedJobId = useJobSelection((state) => state.jobId);
  const selectJob = useJobSelection((state) => state.selectJob);
  const requested = useRef<string | null>(null);
  const { snapshot, connection } = useSnapshotStream<DispatchTrackingSnapshot>(`/api/tracking/dispatch/stream?date=${date}`);
  const current = revision(jobs);
  const live = snapshot && connection === "live" ? revision(snapshot.jobs) : undefined;
  const trips = connection === "live" ? snapshot?.trips ?? [] : [];
  const pins = useMemo(() => jobs.flatMap(({ id, destination, status }) => destination
    ? [{ jobId: id, position: destination, status }] : []), [jobs]);

  useEffect(() => {
    if (live === undefined || live === current) {
      requested.current = null;
      return;
    }
    if (requested.current === live) return;
    requested.current = live;
    router.refresh();
  }, [current, live, router]);

  function openWorkOrder(jobId: string) {
    selectJob(jobId);
    revealWorkOrder();
  }

  return (
    <section aria-labelledby="live-dispatch" className="space-y-3 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="live-dispatch" className="font-semibold">Live technicians</h2>
        <p role="status" className={`inline-flex items-center gap-1.5 text-xs font-semibold ${connection === "live" ? "text-green-800" : "text-amber-900"}`}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {connection === "live" ? "Live updates connected"
            : connection === "expired" ? "Session expired"
              : connection === "unavailable" ? "Live updates unavailable" : "Connecting to live updates…"}
        </p>
      </header>
      <LocationsMap jobs={pins} trips={trips} dispatch selectedJobId={selectedJobId} onSelectJob={openWorkOrder} />
      {trips.length > 0 ? (
        <ul className="divide-y divide-neutral-100">
          {trips.map((trip) => (
            <li key={trip.jobId} className="py-2">
              <p className="mb-1 text-sm font-semibold">{trip.title}</p>
              <TripSummary trip={trip} />
            </li>
          ))}
        </ul>
      ) : connection === "live" ? <p className="text-sm text-neutral-600">Location appears when an en route technician shares GPS.</p> : null}
      {connection === "expired" && <a href="/login" className="text-sm font-semibold text-neutral-900 underline">Sign in again</a>}
    </section>
  );
}
