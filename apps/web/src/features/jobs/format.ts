import type { JobStatus, Priority } from "./types";

export const statusLabels: Record<JobStatus, string> = {
  UNASSIGNED: "Unassigned", SCHEDULED: "Scheduled", EN_ROUTE: "En route", ARRIVED: "Arrived", COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const statusTone: Record<JobStatus, string> = {
  UNASSIGNED: "bg-amber-400 text-neutral-950",
  SCHEDULED: "bg-neutral-800 text-white",
  EN_ROUTE: "bg-orange-700 text-white",
  ARRIVED: "bg-green-800 text-white",
  COMPLETED: "bg-neutral-600 text-white",
  CANCELLED: "bg-neutral-100 text-neutral-700",
};

export const priorityLabels: Record<Priority, string> = { STANDARD: "Standard", HIGH: "High", EMERGENCY: "Emergency" };

export function formatTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function formatDay(day: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T00:00:00Z`));
}

export function readDate(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

export function dateQuery(date: string | undefined) {
  return date ? `?${new URLSearchParams({ date })}` : "";
}
