import type { Metadata } from "next";
import Link from "next/link";
import { getWorkspaceData } from "../../../features/auth/server-api";
import { formatMoney, type Ledger } from "../../../features/billing/types";
import { PageHeading } from "../../../features/workspace/page-heading";
import { SummaryValue } from "../../../features/workspace/summary-value";

export const metadata: Metadata = { title: "Ledger" };
const accountNames: Record<string, string> = {
  RECEIVABLES: "Accounts receivable",
  SERVICE_REVENUE: "Service revenue",
  DEMO_CLEARING: "Payment clearing",
};
const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });

export default async function LedgerPage() {
  const ledger = await getWorkspaceData<Ledger>("/api/billing/ledger", "/app/dispatch");
  return (
    <main className="rl-page space-y-5">
      <PageHeading title="Ledger" />
      <dl className="grid grid-cols-2 gap-4">
        <SummaryValue label="Accounts receivable" value={formatMoney(ledger.outstandingMinor)} />
        <SummaryValue label="Settled invoices" value={formatMoney(ledger.settledMinor)} />
      </dl>
      <section aria-labelledby="journal" className="border-t border-neutral-200 pt-4">
        <h2 id="journal" className="mb-3 font-semibold">Recent journal postings</h2>
        {ledger.entries.length ? (
          <div className="overflow-x-auto border-b border-neutral-200" role="region" aria-label="Journal entries" tabIndex={0}>
            <table className="w-full min-w-[39rem] text-left text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-600">
                <tr>
                  {["Posting", "Invoice", "Debit account", "Credit account", "Amount"].map((column) => (
                    <th key={column} scope="col" className="px-4 py-3 font-semibold">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {ledger.entries.map((entry) => (
                  <tr key={`${entry.invoiceId}-${entry.event}`} className="hover:bg-neutral-50/80">
                    <td className="px-4 py-3">
                      <p className="font-medium">{entry.event === "ISSUED" ? "Invoice issued" : "Payment settled"}</p>
                      <time dateTime={entry.postedAt} className="text-xs text-neutral-600">{date.format(new Date(entry.postedAt))}</time>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/app/jobs/${entry.jobId}`} className="text-neutral-900 hover:underline" title={entry.invoiceId}>
                        {entry.invoiceId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{accountNames[entry.debitAccount]}</td>
                    <td className="px-4 py-3">{accountNames[entry.creditAccount]}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">{formatMoney(entry.amountMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-neutral-600">No journal postings yet.</p>}
      </section>
    </main>
  );
}
