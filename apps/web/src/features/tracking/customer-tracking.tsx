"use client";

import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { useSnapshotStream } from "../../hooks/use-snapshot-stream";
import { PortalCheckout } from "../billing/portal-checkout";
import type { InvoiceView } from "../billing/types";
import { StatusPill } from "../jobs/job-status";
import { LocationsMap } from "./locations-map";
import { TripSummary } from "./trip-summary";
import type { CustomerTrackingSnapshot } from "./types";

function CustomerInvoice({ path, initial }: { path: string; initial: InvoiceView | null }) {
  const [billing, setBilling] = useState(initial);
  const [attempt, setAttempt] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState(-1);
  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(path, { cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) throw new Error("Invoice unavailable");
        const data: InvoiceView = await response.json();
        if (!controller.signal.aborted) setBilling(data);
      } catch {
        if (!controller.signal.aborted) setFailedAttempt(attempt);
      }
    })();
    return () => controller.abort();
  }, [attempt, initial, path]);
  if (billing) return <PortalCheckout path={path} initial={billing} />;
  return (
    <section className="rl-panel p-5 text-sm text-neutral-700">
      {failedAttempt === attempt ? (
        <>
          <p>Could not load the invoice.</p>
          <button type="button" onClick={() => setAttempt(attempt + 1)}
            className="mt-2 min-h-11 font-semibold text-neutral-900 underline">Retry invoice</button>
        </>
      ) : <p role="status">Loading invoice…</p>}
    </section>
  );
}

export function CustomerTracking({ initial, streamPath, billingPath, billing }: {
  initial: CustomerTrackingSnapshot; streamPath: string; billingPath: string; billing: InvoiceView | null;
}) {
  const trackLive = initial.status !== "COMPLETED" && initial.status !== "CANCELLED";
  const { snapshot, connection } = useSnapshotStream<CustomerTrackingSnapshot>(trackLive ? streamPath : null);
  const job = snapshot ?? initial;
  const trip = connection === "live" ? job.trip : null;
  if (connection === "expired") {
    return <p role="status" className="rl-panel p-5">This customer link has expired. Ask the service team for a new one.</p>;
  }
  return (
    <>
      <header className="rl-panel space-y-2 p-5 sm:p-6">
        <p className="text-sm font-medium text-neutral-600">{job.tenantName}</p>
        <h1 className="rl-page-title">{job.title}</h1>
        <p className="text-sm text-neutral-600">{job.customerName} · {job.address}</p>
      </header>
      <section aria-labelledby="live-tracking-heading" className="rl-panel space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="live-tracking-heading" className="flex items-center gap-2 font-semibold">
            <MapPin size={17} className="text-neutral-900" aria-hidden="true" />Service status
          </h2>
          <span role="status"><StatusPill status={job.status} /></span>
        </div>
        {trackLive && connection !== "live" && (
          <p role="status" className="text-xs font-medium text-amber-900">
            {connection === "unavailable" ? "Live updates are unavailable. Reload the page to reconnect."
              : connection === "reconnecting" ? "Reconnecting to live updates…" : "Connecting to live updates…"}
          </p>
        )}
        {trip ? <><TripSummary trip={trip} /><LocationsMap trips={[trip]} /></> : (
          job.status === "EN_ROUTE" && <p className="text-sm text-neutral-600">Waiting for the technician’s location.</p>
        )}
      </section>
      {job.status === "COMPLETED" && <CustomerInvoice path={billingPath} initial={billing} />}
    </>
  );
}
