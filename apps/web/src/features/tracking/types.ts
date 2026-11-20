import type { Coordinates, JobStatus } from "../jobs/types";

export type { Coordinates };
export type JobPin = { jobId: string; position: Coordinates; status: JobStatus };
export type Trip = {
  jobId: string;
  title: string;
  technicianName: string;
  position: Coordinates;
  destination: Coordinates | null;
  etaMinutes: number | null;
  route: [number, number][] | null;
  capturedAt: string;
  source: "device" | "demo";
};

export type CustomerTrackingSnapshot = {
  jobId: string; tenantName: string; title: string; customerName: string; address: string;
  status: JobStatus; trip: Trip | null;
};

export type DispatchTrackingSnapshot = { jobs: { id: string; version: number }[]; trips: Trip[] };
