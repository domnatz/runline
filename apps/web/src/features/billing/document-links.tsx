import type { InvoiceView } from "./types";

export function DocumentLinks({ basePath, billing }: { basePath: string; billing: InvoiceView }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold">
      {billing.documents.invoice ? (
        <a href={`${basePath}/invoice`} className="inline-flex min-h-11 items-center text-neutral-900 hover:underline">Download invoice</a>
      ) : (
        <span className="inline-flex min-h-11 items-center font-normal text-neutral-600">Invoice PDF is being prepared</span>
      )}
      {billing.invoice.paidAt && (billing.documents.receipt ? (
        <a href={`${basePath}/receipt`} className="inline-flex min-h-11 items-center text-neutral-900 hover:underline">Download receipt</a>
      ) : (
        <span className="inline-flex min-h-11 items-center font-normal text-neutral-600">Receipt PDF is being prepared</span>
      ))}
    </div>
  );
}
