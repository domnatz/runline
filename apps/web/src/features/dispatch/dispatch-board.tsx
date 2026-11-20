"use client";

import { ArrowUpRight, ChevronRight, Siren } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { sendJobAction } from "../jobs/client-api";
import { PriorityLabel, StatusPill } from "../jobs/job-status";
import type { DispatchSnapshot, Job } from "../jobs/types";
import { DispatchLive } from "../tracking/dispatch-live";
import { ScheduleForm } from "./schedule-form";
import { DispatchSelection, useJobSelection } from "./selection";
import { Timeline } from "./timeline";

function QueueItem({ job }: { job: Job }) {
  const active = useJobSelection((state) => state.jobId === job.id);
  const selectJob = useJobSelection((state) => state.selectJob);
  return (
    <li>
      <button type="button" onClick={() => selectJob(job.id)} aria-pressed={active}
        className={`flex min-h-14 w-full items-center gap-2.5 px-4 py-2.5 text-left sm:px-6 ${active ? "bg-neutral-100" : "hover:bg-neutral-50"}`}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{job.title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-neutral-600">{job.customerName} · {job.address}</span>
        </span>
        <PriorityLabel priority={job.priority} />
        <ChevronRight size={16} className="shrink-0 text-neutral-400" aria-hidden="true" />
      </button>
    </li>
  );
}

function EmergencyButton() {
  const router = useRouter();
  const selectJob = useJobSelection((state) => state.selectJob);
  const [pending, setPending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function addEmergency() {
    setPending(true);
    setError("");
    try {
      const response = await sendJobAction("/api/jobs/emergency-demo", "POST");
      const data: { id: string } = await response.json();
      toast.success("Emergency call added.");
      selectJob(data.id);
      startTransition(() => router.refresh());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not add the emergency call.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-w-0">
      <button type="button" onClick={addEmergency} disabled={pending || refreshing}
        className="rl-button min-h-10 border-red-700 text-red-800 hover:border-red-800 hover:bg-neutral-50">
        <Siren size={16} aria-hidden="true" />
        {pending || refreshing ? "Adding call…" : "Add emergency call"}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function SelectedWorkOrder({ snapshot }: { snapshot: DispatchSnapshot }) {
  const jobId = useJobSelection((state) => state.jobId);
  const job = snapshot.jobs.find(({ id }) => id === jobId);
  if (!job) return <p className="px-4 py-5 text-sm text-neutral-600 sm:px-6">Select a work order to see its details.</p>;

  return (
    <section aria-labelledby="selected-job" className="px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="selected-job" className="text-base font-semibold">{job.title}</h2>
            <StatusPill status={job.status} />
          </div>
          <p className="mt-1 text-sm text-neutral-600">{job.customerName} · {job.address}</p>
        </div>
        <Link href={`/app/jobs/${job.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-900 hover:underline">
          View work order <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {(job.status === "UNASSIGNED" || job.status === "SCHEDULED") && (
        <ScheduleForm key={`${job.id}:${job.version}`} job={job} date={snapshot.date} technicians={snapshot.technicians}
          revision={snapshot.jobs.map(({ id, version }) => `${id}:${version}`).join(",")} />
      )}
    </section>
  );
}

export function DispatchBoard({ snapshot, initialJob }: { snapshot: DispatchSnapshot; initialJob: string | null }) {
  const workOrderPanel = useRef<HTMLDivElement>(null);
  const queue = snapshot.jobs.filter((job) => job.status === "UNASSIGNED");
  const scheduled = snapshot.jobs.filter((job) => job.serviceDate === snapshot.date);

  return (
    <DispatchSelection initialJob={initialJob}>
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(21rem,1fr)]">
        <div className="min-w-0 divide-y divide-neutral-200">
          <Timeline technicians={snapshot.technicians} jobs={scheduled} />
          <DispatchLive date={snapshot.date} jobs={snapshot.jobs}
            revealWorkOrder={() => workOrderPanel.current?.scrollIntoView({ block: "nearest" })} />
        </div>
        <div className="min-w-0 divide-y divide-neutral-200 border-t border-neutral-200 lg:border-t-0 lg:border-l">
          <section aria-labelledby="queue-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3.5 sm:px-6">
              <h2 id="queue-title" className="font-semibold">Unassigned work orders</h2>
              {snapshot.demoMode && <EmergencyButton />}
            </div>
            {queue.length ? <ul className="divide-y divide-neutral-100">{queue.map((job) => <QueueItem key={job.id} job={job} />)}</ul>
              : <p className="px-4 py-3 text-sm text-neutral-600 sm:px-6">No jobs are waiting for assignment.</p>}
          </section>
          <div ref={workOrderPanel}><SelectedWorkOrder snapshot={snapshot} /></div>
        </div>
      </div>
    </DispatchSelection>
  );
}
