import { DatePicker } from "../jobs/date-picker";
import { dateQuery, formatDay, formatTime } from "../jobs/format";
import { PriorityLabel, StatusPill } from "../jobs/job-status";
import { PageHeading } from "../workspace/page-heading";
import type { FieldDay } from "./types";

export function RouteList({ day }: { day: FieldDay }) {
  return (
    <div className="space-y-4">
      <PageHeading title="My route" detail={`${formatDay(day.date)} · ${day.timeZone}`}
        actions={<DatePicker date={day.date} today={day.today} path="/tech" />} />
      {day.jobs.length ? <ol className="rl-panel divide-y divide-neutral-200">
        {day.jobs.map(({ job }) => (
          <li key={job.id} className="p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {job.startMinute !== null && (
                <span className="text-sm font-semibold tabular-nums text-neutral-700">{formatTime(job.startMinute)}</span>
              )}
              <div className="flex items-center gap-2"><PriorityLabel priority={job.priority} /><StatusPill status={job.status} /></div>
            </div>
            <h2 className="mt-2 font-semibold text-neutral-900">{job.title}</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-600">{job.customerName} · {job.address}</p>
            <a href={`/tech/jobs/${job.id}${dateQuery(day.date)}`}
              className="rl-button mt-3 min-h-11 text-neutral-900 hover:bg-neutral-50">
              Open work order<span className="sr-only"> {job.title}</span>
            </a>
          </li>
        ))}
      </ol> : <p className="rl-panel p-5 text-sm text-neutral-600">No assignments for this date.</p>}
    </div>
  );
}
