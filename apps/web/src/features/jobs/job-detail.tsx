import { CalendarClock, History } from "lucide-react";
import type { ReactNode } from "react";
import { formatDay, formatTime, statusLabels } from "./format";
import { PriorityLabel, StatusPill } from "./job-status";
import type { JobDetail, JobEvent, JobStatus } from "./types";

const steps: JobStatus[] = ["UNASSIGNED", "SCHEDULED", "EN_ROUTE", "ARRIVED", "COMPLETED"];
const actions: Record<JobEvent["action"], string> = {
  CREATED: "Work order created", ASSIGNED: "Technician assigned", RESCHEDULED: "Appointment updated", STATUS_CHANGED: "Status updated",
  EDITED: "Work order edited", CANCELLED: "Work order cancelled",
};

export function JobDetailView({ detail, children }: { detail: JobDetail; children?: ReactNode }) {
  const { job, events, timeZone } = detail;
  const activeStep = steps.indexOf(job.status);
  const formatEventTime = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone });

  return (
    <div className="grid gap-5">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="rl-page-title">{job.title}</h1>
            <p className="mt-1 text-sm text-neutral-600">{job.customerName} · {job.address}</p>
          </div>
          <div className="flex items-center gap-2"><PriorityLabel priority={job.priority} /><StatusPill status={job.status} /></div>
        </div>
        {activeStep >= 0 && <ol aria-label="Work order progress" className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-y border-neutral-200 py-2.5 text-xs font-medium">
          {steps.map((status, index) => (
            <li key={status} aria-current={index === activeStep ? "step" : undefined}
              className={`flex items-center gap-1.5 ${index === activeStep ? "font-bold text-neutral-900" : "text-neutral-600"}`}>
              <span aria-hidden="true" className={`size-2 rounded-full ${index <= activeStep ? "bg-neutral-900" : "bg-neutral-300"}`} />
              {statusLabels[status]}
            </li>
          ))}
        </ol>}
        {job.serviceDate && job.startMinute !== null && job.durationMinutes !== null && (
          <p className="mt-5 flex items-start gap-2 text-sm text-neutral-700">
            <CalendarClock size={16} className="mt-0.5 shrink-0 text-neutral-900" aria-hidden="true" />
            {job.technicianName} · {formatDay(job.serviceDate)} · {formatTime(job.startMinute)} to {formatTime(job.startMinute + job.durationMinutes)}
          </p>
        )}
        {job.notes && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-neutral-700">{job.notes}</p>}
        {children && <div className="mt-5">{children}</div>}
      </section>
      <section aria-labelledby="audit-title" className="border-t border-neutral-200 pt-4">
        <h2 id="audit-title" className="flex items-center gap-2 font-semibold">
          <History size={18} className="text-neutral-900" aria-hidden="true" />Audit history
        </h2>
        <ol className="mt-1 divide-y divide-neutral-200">
          {events.map((event) => (
            <li key={event.version} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-semibold">{event.arrivalSource === "geofence" ? "Arrival detected by geofence"
                  : event.arrivalSource === "manual" ? "Arrival marked manually" : actions[event.action]}</p>
                <p className="mt-1 text-xs leading-5 text-neutral-600">
                  {event.actorName ?? "System"} · {event.previousStatus && event.previousStatus !== event.status ? `${statusLabels[event.previousStatus]} to ` : ""}{statusLabels[event.status]}
                </p>
                {event.reason && <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm text-neutral-700">{event.reason}</p>}
                {event.technicianName && event.serviceDate && event.startMinute !== null && event.action !== "STATUS_CHANGED" && (
                  <p className="text-xs leading-5 text-neutral-600">{event.technicianName} · {event.serviceDate} at {formatTime(event.startMinute)}</p>
                )}
              </div>
              <time className="text-xs text-neutral-500" dateTime={event.occurredAt}>{formatEventTime.format(new Date(event.occurredAt))}</time>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
