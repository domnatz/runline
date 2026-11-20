import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getWorkspaceData } from "../../../../features/auth/server-api";
import { CustomerLink } from "../../../../features/billing/customer-link";
import { DocumentLinks } from "../../../../features/billing/document-links";
import { InvoiceSummary } from "../../../../features/billing/invoice-summary";
import type { InvoiceView } from "../../../../features/billing/types";
import { JobDetailView } from "../../../../features/jobs/job-detail";
import type { JobDetail } from "../../../../features/jobs/types";
import { WorkOrderActions } from "../../../../features/jobs/work-order-actions";

export const metadata: Metadata = { title: "Work order" };

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getWorkspaceData<JobDetail>(`/api/jobs/${encodeURIComponent(id)}`, "/tech");
  const { job } = detail;
  const billing = job.status === "COMPLETED"
    ? (await getWorkspaceData<{ billing: InvoiceView | null }>(`/api/billing/jobs/${job.id}`, "/tech")).billing
    : null;
  const schedule = new URLSearchParams({ job: job.id });
  if (job.serviceDate) schedule.set("date", job.serviceDate);

  return (
    <main className="rl-page max-w-5xl space-y-4">
      <Link href="/app/jobs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-900 hover:underline">
        <ArrowLeft size={15} aria-hidden="true" />Back to work orders
      </Link>
      <JobDetailView detail={detail}>
        {(job.status === "UNASSIGNED" || job.status === "SCHEDULED") && (
          <>
            <Link href={`/app/dispatch?${schedule}`} className="rl-button rl-button-primary min-h-11">
              {job.status === "UNASSIGNED" ? "Assign on dispatch board" : "Edit appointment"}
            </Link>
            <WorkOrderActions key={`${job.id}:${job.version}`} job={job} />
          </>
        )}
      </JobDetailView>
      {billing ? (
        <section aria-label="Billing" className="space-y-4 border-t border-neutral-200 pt-4">
          <InvoiceSummary billing={billing} />
          <DocumentLinks basePath={`/api/billing/invoices/${billing.invoice.id}/documents`} billing={billing} />
          <CustomerLink jobId={job.id} />
        </section>
      ) : (
        <section aria-label="Customer tracking link" className="border-t border-neutral-200 pt-4">
          <CustomerLink jobId={job.id} />
        </section>
      )}
    </main>
  );
}
