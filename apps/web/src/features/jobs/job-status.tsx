import { priorityLabels, statusLabels, statusTone } from "./format";
import type { JobStatus, Priority } from "./types";

export function StatusPill({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${statusTone[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  const tone = priority === "EMERGENCY" ? "text-red-700" : priority === "HIGH" ? "text-amber-800" : "text-neutral-600";
  return <span className={`text-xs font-semibold ${tone}`}>{priorityLabels[priority]}</span>;
}
