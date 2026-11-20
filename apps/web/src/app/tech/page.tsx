import type { Metadata } from "next";
import { getWorkspaceData } from "../../features/auth/server-api";
import { FieldWorkspace } from "../../features/field/field-workspace";
import type { FieldManifest } from "../../features/field/types";
import { dateQuery, readDate } from "../../features/jobs/format";

export const metadata: Metadata = { title: "My route" };

export default async function TechnicianRoutePage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const { date } = await searchParams;
  const manifest = await getWorkspaceData<FieldManifest>(`/api/tech/manifest${dateQuery(readDate(date))}`, "/app/dispatch");
  return <FieldWorkspace initial={manifest} />;
}
