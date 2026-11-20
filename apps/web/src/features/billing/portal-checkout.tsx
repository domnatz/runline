"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DocumentLinks } from "./document-links";
import { InvoiceSummary } from "./invoice-summary";
import type { InvoiceView } from "./types";

const scenarios = [
  { id: "success", label: "Record payment" },
  { id: "decline", label: "Decline payment" },
  { id: "timeout", label: "Delay confirmation" },
] as const;
type Attempt = { scenario: (typeof scenarios)[number]["id"]; key: string };
const primary = "rl-button rl-button-primary min-h-11";
const secondary = "rl-button min-h-11";

async function readBilling(path: string, signal = AbortSignal.timeout(8000)): Promise<InvoiceView> {
  const response = await fetch(path, { cache: "no-store", signal });
  if (response.status === 404) throw new Error("This customer link has expired. Ask the service team for a new one.");
  if (!response.ok) throw new Error("Could not check the invoice. Try again.");
  return response.json();
}

export function PortalCheckout({ path, initial }: { path: string; initial: InvoiceView }) {
  const [billing, setBilling] = useState(initial);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [message, setMessage] = useState("");
  const waitingForPdf = !billing.documents.invoice || Boolean(billing.invoice.paidAt && !billing.documents.receipt);

  useEffect(() => {
    if (!waitingForPdf || pending || attempt) return;
    const controller = new AbortController();
    let remaining = 15;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const updated = await readBilling(path, AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
        if (!controller.signal.aborted) setBilling(updated);
      } catch {
        // manual refresh can recover when automatic document checks stop.
      }
      if (!controller.signal.aborted && --remaining > 0) timer = setTimeout(poll, 2000);
    }
    timer = setTimeout(poll, 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, waitingForPdf, pending, attempt]);

  async function pay(payment: Attempt) {
    setPending(true);
    setAttempt(payment);
    setMessage("");
    try {
      const response = await fetch(`${path}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": payment.key },
        body: JSON.stringify({ scenario: payment.scenario }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 404) {
        setMessage("This customer link has expired. Ask the service team for a new one.");
        setAttempt(null);
        return;
      }
      if (!response.ok) throw new Error("Checkout response was unavailable");
      const { outcome }: { outcome: "PAID" | "DECLINED" } = await response.json();
      if (outcome === "PAID") {
        setBilling(await readBilling(path));
        toast.success("Payment recorded.");
      } else setMessage("Payment declined.");
      setAttempt(null);
    } catch {
      setMessage("The checkout result is unconfirmed. Retry the same payment or check its status.");
    } finally {
      setPending(false);
    }
  }

  async function checkStatus() {
    setPending(true);
    setMessage("");
    try {
      const updated = await readBilling(path);
      setBilling(updated);
      if (updated.invoice.paidAt) {
        setAttempt(null);
        if (!billing.invoice.paidAt) toast.success("Payment recorded.");
      } else setMessage("The invoice is still unpaid.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not check the invoice.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="Invoice and checkout" className="rl-panel space-y-4 p-5 sm:p-6">
      <InvoiceSummary billing={billing} />
      <p className="text-sm text-neutral-600">No funds collected.</p>
      <DocumentLinks basePath={`${path}/documents`} billing={billing} />
      {!billing.invoice.paidAt && (
        <div className="space-y-3 border-t border-neutral-200 pt-4">
          <h2 className="font-semibold">Checkout</h2>
          {attempt ? (
            <button type="button" disabled={pending} className={primary} onClick={() => void pay(attempt)}>
              {pending ? "Checking payment…" : "Retry same payment"}
            </button>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {scenarios.map(({ id, label }) => (
                <button key={id} type="button" disabled={pending} className={id === "success" ? `${primary} sm:col-span-2` : secondary}
                  onClick={() => void pay({ scenario: id, key: globalThis.crypto.randomUUID() })}>{label}</button>
              ))}
            </div>
          )}
        </div>
      )}
      {(attempt || waitingForPdf) && (
        <button type="button" disabled={pending} className="min-h-11 text-sm font-semibold text-neutral-900 hover:underline disabled:opacity-60"
          onClick={() => void checkStatus()}>{billing.invoice.paidAt ? "Refresh documents" : "Check payment status"}</button>
      )}
      {message && <p role="status" className="text-sm text-neutral-700">{message}</p>}
    </section>
  );
}
