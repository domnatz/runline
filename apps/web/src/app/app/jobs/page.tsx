import type { Metadata } from "next";
import Link from "next/link";
import { getWorkspaceData } from "../../../features/auth/server-api";
import { CreateJobForm } from "../../../features/jobs/create-job-form";
import { formatTime } from "../../../features/jobs/format";
import { PriorityLabel, StatusPill } from "../../../features/jobs/job-status";
import type { Job } from "../../../features/jobs/types";
import { PageHeading } from "../../../features/workspace/page-heading";

export const metadata: Metadata = { title: "Work orders" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ new?: string | string[] }> }) {
  const [{ jobs }, params] = await Promise.all([
    getWorkspaceData<{ jobs: Job[] }>("/api/jobs", "/tech"),
    searchParams,
  ]);

  return (
    <main className="rl-page space-y-5">
      <PageHeading title="Work orders" />
      <CreateJobForm initiallyOpen={params.new === "1"} />
      {jobs.length ? (
        <div className="overflow-x-auto border-y border-neutral-200" tabIndex={0} role="region" aria-label="Work orders list">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr><th scope="col" className="px-4 py-3">Work order</th><th scope="col" className="px-4 py-3">Priority</th>
                <th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Appointment</th></tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-neutral-200 hover:bg-neutral-50/80">
                  <th scope="row" className="px-4 py-3 font-medium">
                    <Link href={`/app/jobs/${job.id}`} className="font-semibold text-neutral-900 hover:underline">{job.title}</Link>
                    <span className="mt-1 block text-xs font-normal text-neutral-600">{job.customerName}</span>
                  </th>
                  <td className="px-4 py-3"><PriorityLabel priority={job.priority} /></td>
                  <td className="px-4 py-3"><StatusPill status={job.status} /></td>
                  <td className="px-4 py-3 text-sm text-neutral-700">
                    {job.serviceDate && job.startMinute !== null
                      ? <>{job.serviceDate} · {formatTime(job.startMinute)}<span className="block text-xs text-neutral-600">{job.technicianName}</span></>
                      : <span className="text-neutral-500">{job.status === "CANCELLED" ? "No appointment" : "Pending assignment"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-neutral-600">No work orders yet.</p>}
    </main>
  );
}
