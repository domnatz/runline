export type Invoice = {
  id: string; jobId: string; tenantName: string; jobTitle: string; customerName: string; address: string;
  currency: string; totalMinor: number; issuedAt: string; paidAt: string | null;
};

export type InvoiceView = {
  invoice: Invoice;
  lines: { description: string; quantity: number; unitMinor: number }[];
  documents: { invoice: boolean; receipt: boolean };
};

export type Ledger = {
  outstandingMinor: number;
  settledMinor: number;
  entries: {
    invoiceId: string; jobId: string; event: "ISSUED" | "SETTLED"; debitAccount: string; creditAccount: string;
    amountMinor: number; postedAt: string;
  }[];
};

export function formatMoney(minor: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, currencyDisplay: "code" }).format(minor / 100);
}
