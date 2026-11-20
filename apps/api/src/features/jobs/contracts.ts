import { z } from "zod";
import { coordinatesSchema } from "../tracking/contracts.js";

export const prioritySchema = z.enum(["STANDARD", "HIGH", "EMERGENCY"]);
export const statusSchema = z.enum(["UNASSIGNED", "SCHEDULED", "EN_ROUTE", "ARRIVED", "COMPLETED", "CANCELLED"]);
export const jobEventAction = z.enum(["CREATED", "ASSIGNED", "RESCHEDULED", "STATUS_CHANGED", "EDITED", "CANCELLED"]);
export const versionSchema = z.int().min(1).max(2147483646);
export const daySchema = z.iso.date().refine((date) => !date.startsWith("0000-"), "Choose a valid date");

export const createJobSchema = z.strictObject({
  title: z.string().trim().min(1).max(100),
  customerName: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(1000).default(""),
  priority: prioritySchema.default("STANDARD"),
  destination: coordinatesSchema.optional(),
  requiredSkills: z.array(z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,29}$/)).max(8).optional(),
});

export const scheduleJobSchema = z.strictObject({
  technicianId: z.uuid(),
  serviceDate: daySchema,
  startMinute: z.int().min(420).max(1125).multipleOf(15),
  durationMinutes: z.int().min(15).max(720).multipleOf(15),
  version: versionSchema,
}).refine(({ startMinute, durationMinutes }) => startMinute + durationMinutes <= 1140, {
  message: "Appointments must finish by 19:00",
});

export const advanceJobSchema = z.strictObject({
  status: z.enum(["EN_ROUTE", "ARRIVED", "COMPLETED"]),
  version: versionSchema,
});

export const scheduleQuery = z.strictObject({ date: daySchema.optional() });
export const editJobSchema = z.strictObject({
  address: createJobSchema.shape.address,
  priority: prioritySchema,
  notes: z.string().trim().max(1000),
  destination: createJobSchema.shape.destination,
  version: versionSchema,
});
export const cancelJobSchema = z.strictObject({ reason: z.string().trim().min(1, "Enter a cancellation reason").max(500), version: versionSchema });

export type NewJob = z.infer<typeof createJobSchema>;
export type ScheduleJob = z.infer<typeof scheduleJobSchema>;
export type AdvanceJob = z.infer<typeof advanceJobSchema>;
export type EditJob = z.infer<typeof editJobSchema>;
export type CancelJob = z.infer<typeof cancelJobSchema>;
export type JobStatus = z.infer<typeof statusSchema>;
export type Priority = z.infer<typeof prioritySchema>;

export type Job = Omit<NewJob, "destination" | "requiredSkills"> & {
  destination: z.infer<typeof coordinatesSchema> | null;
  requiredSkills: string[];
  id: string;
  status: JobStatus;
  technicianId: string | null;
  technicianName: string | null;
  serviceDate: string | null;
  startMinute: number | null;
  durationMinutes: number | null;
  version: number;
  createdAt: Date;
};

export type JobEvent = {
  version: number;
  action: z.infer<typeof jobEventAction>;
  actorName: string | null;
  previousStatus: JobStatus | null;
  status: JobStatus;
  technicianName: string | null;
  serviceDate: string | null;
  startMinute: number | null;
  durationMinutes: number | null;
  occurredAt: Date;
  arrivalSource: "manual" | "geofence" | null;
  reason: string | null;
};
