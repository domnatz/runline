import type { Metadata } from "next";
import Link from "next/link";
import { getWorkspaceData } from "../../../features/auth/server-api";
import { CustomerLink } from "../../../features/billing/customer-link";
import { PageHeading } from "../../../features/workspace/page-heading";

export const metadata: Metadata = { title: "Notifications" };

const labels = {
  APPOINTMENT_CONFIRMED: "Appointment confirmed",
  APPOINTMENT_CHANGED: "Appointment changed",
  TECHNICIAN_EN_ROUTE: "Technician en route",
  TECHNICIAN_ARRIVED: "Technician arrived",
};

type Notification = {
  jobId: string; title: string; version: number; kind: keyof typeof labels; deliveryStatus: "SIMULATED"; createdAt: string;
};

const formatDate = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
});

export default async function NotificationsPage() {
  const { enabled, notifications } = await getWorkspaceData<{ enabled: boolean; notifications: Notification[] }>(
    "/api/demo/notifications", "/app/dispatch",
  );
  return (
    <main className="rl-page max-w-5xl space-y-5">
      <PageHeading title="Notification outbox" />
      {notifications.length ? (
        <div className="divide-y divide-neutral-200 border-y border-neutral-200">
          {notifications.map((item) => (
            <article key={`${item.jobId}:${item.version}`} className="grid gap-3 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">{labels[item.kind]}</h2>
                  <Link href={`/app/jobs/${item.jobId}`} className="text-sm font-medium text-neutral-900 hover:underline">{item.title}</Link>
                </div>
                <div className="space-y-1">
                  {item.deliveryStatus === "SIMULATED" && <p className="rounded-full bg-neutral-50 px-3 py-1 text-xs font-semibold text-neutral-900">Logged only</p>}
                  <time dateTime={item.createdAt} className="block text-xs text-neutral-600">{formatDate.format(new Date(item.createdAt))}</time>
                </div>
              </div>
              <CustomerLink jobId={item.jobId} copyOnCreate />
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-700">
          {enabled ? "Appointment and arrival events will appear here." : "The outbox is unavailable."}
        </p>
      )}
    </main>
  );
}
