import { z } from "zod";
import { advanceJobSchema } from "../jobs/contracts.js";

export const checklistKey = z.enum(["inspect", "repair", "verify"]);
const id = z.uuid();
const mutationFields = { id, jobId: id };

export const fieldMutation = z.discriminatedUnion("type", [
  advanceJobSchema.extend({ ...mutationFields, type: z.literal("status") }),
  z.strictObject({ ...mutationFields, type: z.literal("checklist"), item: checklistKey, checked: z.boolean() }),
  z.strictObject({ ...mutationFields, type: z.literal("part"), sku: z.string().regex(/^[A-Z0-9-]{1,48}$/), quantity: z.int().min(1).max(99) }),
]);

export const syncBatch = z.strictObject({
  tenantId: id,
  userId: id,
  datasetId: z.string().regex(/^[a-f0-9]{16}$/).optional(),
  mutations: z.array(fieldMutation).min(1).max(16),
});

export const idempotencyKey = z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/);
export type FieldMutation = z.infer<typeof fieldMutation>;
export type SyncBatch = z.infer<typeof syncBatch>;
export type ChecklistKey = z.infer<typeof checklistKey>;

export type MutationOutcome =
  | { id: string; state: "applied"; remaining?: number }
  | { id: string; state: "rejected"; message: string; remaining?: number }
  | { id: string; state: "blocked" };
