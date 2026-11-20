"use client";

import { useSearchParams } from "next/navigation";
import { readDate } from "../jobs/format";
import { FieldWorkspace } from "./field-workspace";

export function OfflineEntry() {
  const query = useSearchParams();
  const target = query.get("target") ?? "/tech";
  let path = "/tech";
  let date: string | undefined;
  if (target.startsWith("/tech")) {
    const route = new URL(target, "https://runline.invalid");
    path = route.pathname;
    date = readDate(route.searchParams.get("date") ?? undefined);
  }
  const jobId = path.startsWith("/tech/jobs/") ? path.slice("/tech/jobs/".length) : undefined;
  return <FieldWorkspace date={date} jobId={jobId} />;
}
