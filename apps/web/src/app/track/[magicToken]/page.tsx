import type { Metadata } from "next";
import { getFromApi } from "../../../features/auth/server-api";
import { PortalCheckout } from "../../../features/billing/portal-checkout";
import type { InvoiceView } from "../../../features/billing/types";
import { CustomerTracking } from "../../../features/tracking/customer-tracking";
import type { CustomerTrackingSnapshot } from "../../../features/tracking/types";
import { Brand } from "../../../features/workspace/brand";

export const metadata: Metadata = { title: "Customer portal", robots: { index: false, follow: false } };

export default async function CustomerPortalPage({ params }: { params: Promise<{ magicToken: string }> }) {
  const { magicToken } = await params;
  const token = encodeURIComponent(magicToken);
  const path = `/api/customer/${token}`;
  const trackingPath = `/api/tracking/customer/${token}`;
  const tokenShape = /^[A-Za-z0-9_.-]{1,800}$/.test(magicToken);
  const trackingResponse = tokenShape ? await getFromApi(trackingPath).catch(() => null) : null;
  const tracking: CustomerTrackingSnapshot | null = trackingResponse?.ok ? await trackingResponse.json() : null;
  const response = (trackingResponse?.status === 404 || tracking?.status === "COMPLETED")
    ? await getFromApi(path).catch(() => null) : null;
  const billing: InvoiceView | null = response?.ok ? await response.json() : null;
  const invalid = response?.status === 404 || !tokenShape;

  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-8 sm:px-6 sm:py-12">
      <div><Brand /></div>
      {tracking ? (
        <CustomerTracking key={trackingPath} initial={tracking} streamPath={`${trackingPath}/stream`} billingPath={path} billing={billing} />
      ) : billing ? (
        <>
          <header className="rl-panel space-y-2 p-5 sm:p-6">
            <p className="text-sm font-medium text-neutral-600">{billing.invoice.tenantName}</p>
            <h1 className="rl-page-title">{billing.invoice.jobTitle}</h1>
            <p className="text-sm font-medium text-green-800">Work order completed</p>
            <p className="text-sm text-neutral-600">{billing.invoice.customerName} · {billing.invoice.address}</p>
          </header>
          <PortalCheckout path={path} initial={billing} />
        </>
      ) : (
        <section className="rl-panel space-y-2 p-6">
          <h1 className="rl-page-title">{invalid ? "Customer link unavailable" : "Invoice temporarily unavailable"}</h1>
          <p className="text-sm text-neutral-700">{invalid
            ? "This link is invalid or expired. Ask the service team for a new one."
            : "Reload this page to try again."}</p>
        </section>
      )}
    </main>
  );
}
