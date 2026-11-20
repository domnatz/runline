import type { Job, JobEvent, JobStatus } from "../jobs/types";

export const checklistItems = {
  inspect: "Inspect the equipment and confirm the issue",
  repair: "Carry out the repair",
  verify: "Verify safe operation before leaving",
};

export type ChecklistItem = keyof typeof checklistItems;
export type StockPart = { sku: string; name: string; quantity: number };
export type FieldProfile = { tenantId: string; userId: string; tenantName: string; userName: string; datasetId?: string };

export type FieldJob = {
  job: Job;
  events: JobEvent[];
  checklist: Partial<Record<ChecklistItem, boolean>>;
  parts: (StockPart & { id: string })[];
};

export type FieldDay = { date: string; today: string; timeZone: string; jobs: FieldJob[] };
export type FieldManifest = FieldDay & { profile: FieldProfile; stock: StockPart[] };

type NextStatus = "EN_ROUTE" | "ARRIVED" | "COMPLETED";
export const nextStep: Partial<Record<JobStatus, { status: NextStatus; label: string }>> = {
  SCHEDULED: { status: "EN_ROUTE", label: "Mark en route" },
  EN_ROUTE: { status: "ARRIVED", label: "Mark arrived" },
  ARRIVED: { status: "COMPLETED", label: "Complete job" },
};

export type FieldChange =
  | { type: "status"; status: NextStatus; version: number }
  | { type: "checklist"; item: ChecklistItem; checked: boolean }
  | { type: "part"; sku: string; quantity: number };

export type FieldMutation = FieldChange & { id: string; jobId: string };
export type MutationOutcome =
  | { id: string; state: "applied"; remaining?: number }
  | { id: string; state: "rejected"; message: string; remaining?: number }
  | { id: string; state: "blocked" };
