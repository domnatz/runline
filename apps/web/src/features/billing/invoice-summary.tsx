import { formatMoney, type InvoiceView } from "./types";

export function InvoiceSummary({ billing }: { billing: InvoiceView }) {
  const { invoice, lines } = billing;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-neutral-900">Invoice</h2>
          <p className="mt-0.5 break-all text-xs text-neutral-500">{invoice.id}</p>
        </div>
        <p className={`rounded-full px-3 py-1 text-sm font-medium ${invoice.paidAt ? "bg-green-800 text-white" : "bg-amber-400 text-neutral-950"}`}>
          {invoice.paidAt ? "Paid" : "Payment due"}
        </p>
      </div>
      <ul className="mt-4 divide-y divide-neutral-100 border-y border-neutral-200">
        {lines.map((line, index) => (
          <li key={index} className="flex justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <p className="break-words font-medium text-neutral-900">{line.description}</p>
              <p className="text-neutral-600">{line.quantity} × {formatMoney(line.unitMinor, invoice.currency)}</p>
            </div>
            <p className="shrink-0 self-center font-medium tabular-nums">
              {formatMoney(line.quantity * line.unitMinor, invoice.currency)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between gap-3 text-base font-semibold text-neutral-900">
        <span>Total</span><span className="tabular-nums">{formatMoney(invoice.totalMinor, invoice.currency)}</span>
      </div>
    </>
  );
}
