"use client";

import { formatTime, statusLabels, statusTone } from "../jobs/format";
import type { Job, Technician } from "../jobs/types";
import { useJobSelection } from "./selection";

const dayStart = 7 * 60;
const dayLength = 12 * 60;
const hours = Array.from({ length: 12 }, (_, index) => dayStart + index * 60);
const legend = ["SCHEDULED", "EN_ROUTE", "ARRIVED", "COMPLETED"] as const;

function Appointment({ job }: { job: Job }) {
  const selected = useJobSelection((state) => state.jobId === job.id);
  const selectJob = useJobSelection((state) => state.selectJob);
  if (job.startMinute === null || job.durationMinutes === null) return null;
  const time = formatTime(job.startMinute);

  return (
    <button type="button" onClick={() => selectJob(job.id)} aria-pressed={selected}
      aria-label={`${job.title}, ${time}, ${statusLabels[job.status]}`}
      title={`${time} ${job.title}`}
      style={{ left: `${(job.startMinute - dayStart) / dayLength * 100}%`, width: `${job.durationMinutes / dayLength * 100}%` }}
      className={`absolute top-2.5 flex h-12 flex-col justify-center overflow-hidden rounded-md px-1.5 text-left ${statusTone[job.status]} ${selected ? "z-10 ring-2 ring-neutral-900 ring-offset-1" : "hover:ring-1 hover:ring-neutral-900"}`}>
      <span className="w-full truncate text-xs font-semibold">{job.title}</span>
      <span className="text-[11px]">{time}</span>
    </button>
  );
}

export function Timeline({ technicians, jobs }: { technicians: Technician[]; jobs: Job[] }) {
  return (
    <section aria-labelledby="timeline-title" className="min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3.5 sm:px-6">
        <h2 id="timeline-title" className="font-semibold">Technician schedule</h2>
        <span className="text-xs tabular-nums text-neutral-600">07:00 to 19:00</span>
      </header>
      {technicians.length ? (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable schedule">
          <div className="min-w-[38rem]">
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] border-b border-neutral-200 bg-neutral-50 text-[0.6875rem] font-semibold tabular-nums text-neutral-600">
              <span className="px-3 py-3">Technician</span>
              <div className="grid grid-cols-12">
                {hours.map((hour) => <span key={hour} className="border-l border-neutral-200 px-1.5 py-3">{formatTime(hour)}</span>)}
              </div>
            </div>
            {technicians.map((technician) => (
              <div key={technician.id} className="grid grid-cols-[7rem_minmax(0,1fr)] border-b border-neutral-200 last:border-0">
                <div className="flex items-center px-3 text-xs font-semibold">{technician.name}</div>
                <div className="relative h-[4.5rem]" role="group" aria-label={`${technician.name}'s appointments`}>
                  <div className="absolute inset-0 grid grid-cols-12" aria-hidden="true">
                    {hours.map((hour) => <div key={hour} className="border-l border-neutral-100" />)}
                  </div>
                  {jobs.filter((job) => job.technicianId === technician.id).map((job) => <Appointment key={job.id} job={job} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : <p className="px-4 py-6 text-sm text-neutral-600">No technicians are available.</p>}
      {technicians.length > 0 && (
        <ul aria-label="Schedule legend" className="flex flex-wrap gap-x-4 gap-y-2 border-t border-neutral-200 px-4 py-3 text-xs font-medium text-neutral-600 sm:px-6">
          {legend.map((status) => (
            <li key={status} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-2 rounded-full ${statusTone[status]}`} />{statusLabels[status]}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
