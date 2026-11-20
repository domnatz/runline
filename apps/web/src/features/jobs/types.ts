export type Priority = "STANDARD" | "HIGH" | "EMERGENCY";
export type JobStatus = "UNASSIGNED" | "SCHEDULED" | "EN_ROUTE" | "ARRIVED" | "COMPLETED" | "CANCELLED";
export type Coordinates = { latitude: number; longitude: number };

export type Job = {
  id: string;
  title: string;
  customerName: string;
  address: string;
  notes: string;
  priority: Priority;
  status: JobStatus;
  technicianId: string | null;
  technicianName: string | null;
  serviceDate: string | null;
  startMinute: number | null;
  durationMinutes: number | null;
  version: number;
  createdAt: string;
  destination?: Coordinates | null;
  requiredSkills?: string[];
};

export type JobEvent = {
  version: number;
  action: "CREATED" | "ASSIGNED" | "RESCHEDULED" | "STATUS_CHANGED" | "EDITED" | "CANCELLED";
  actorName: string | null;
  previousStatus: JobStatus | null;
  status: JobStatus;
  technicianName: string | null;
  serviceDate: string | null;
  startMinute: number | null;
  durationMinutes: number | null;
  occurredAt: string;
  arrivalSource?: "manual" | "geofence" | null;
  reason?: string | null;
};

export type Technician = { id: string; name: string };
export type DailyRoute = { date: string; today: string; timeZone: string; jobs: Job[] };
export type DispatchSnapshot = DailyRoute & { technicians: Technician[]; demoMode: boolean };
export type JobDetail = { job: Job; events: JobEvent[]; timeZone: string };
