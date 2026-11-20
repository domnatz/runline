import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getWorkspaceData, requireWorkspaceSession } from "../../../features/auth/server-api";
import { DispatchBoard } from "../../../features/dispatch/dispatch-board";
import { DatePicker } from "../../../features/jobs/date-picker";
import { dateQuery, formatDay, readDate } from "../../../features/jobs/format";
import type { DispatchSnapshot } from "../../../features/jobs/types";
import { PageHeading } from "../../../features/workspace/page-heading";
import { SummaryValue } from "../../../features/workspace/summary-value";

export const metadata: Metadata = { title: "Dispatch" };

export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ date?: string | string[]; job?: string | string[] }> }) {
  const params = await searchParams;
  const [session, snapshot] = await Promise.all([
    requireWorkspaceSession(),
    getWorkspaceData<DispatchSnapshot>(`/api/dispatch${dateQuery(readDate(params.date))}`, "/tech"),
  ]);
  const initialJob = snapshot.jobs.find(({ id }) => id === params.job)?.id
    ?? snapshot.jobs.find(({ status }) => status === "UNASSIGNED")?.id ?? null;
  const counts = { UNASSIGNED: 0, SCHEDULED: 0, EN_ROUTE: 0, ARRIVED: 0, COMPLETED: 0, CANCELLED: 0 };
  for (const { status } of snapshot.jobs) counts[status] += 1;

  return (
    <main>
      <div className="px-4 pt-5 sm:px-6 sm:pt-6">
        <PageHeading title="Dispatch" detail={`${formatDay(snapshot.date)} · ${snapshot.timeZone}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker date={snapshot.date} today={snapshot.today} path="/app/dispatch" />
              <Link href="/app/jobs?new=1#new-work-order" className="rl-button min-h-11 border-orange-700 bg-orange-700 text-white hover:border-orange-800 hover:bg-orange-800">
                <Plus size={16} aria-hidden="true" />New work order
              </Link>
            </div>
          } />
      </div>
      <section aria-label="Dispatch summary" className="border-b border-neutral-200">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-5 sm:grid-cols-4 sm:px-6">
          <SummaryValue label="Unassigned" value={counts.UNASSIGNED} />
          <SummaryValue label="Scheduled" value={counts.SCHEDULED} />
          <SummaryValue label="In progress" value={counts.EN_ROUTE + counts.ARRIVED} />
          <SummaryValue label="Completed" value={counts.COMPLETED} />
        </dl>
      </section>
      <DispatchBoard key={`${session.tenantId}:${snapshot.date}:${typeof params.job === "string" ? params.job : ""}`}
        snapshot={snapshot} initialJob={initialJob} />
    </main>
  );
}
