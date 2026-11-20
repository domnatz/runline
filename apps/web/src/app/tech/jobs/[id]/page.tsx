import type { Metadata } from "next";
import { getWorkspaceData } from "../../../../features/auth/server-api";
import { FieldWorkspace } from "../../../../features/field/field-workspace";
import type { FieldManifest } from "../../../../features/field/types";

export const metadata: Metadata = { title: "Work order" };

export default async function TechnicianJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manifest = await getWorkspaceData<FieldManifest>(`/api/tech/manifest?${new URLSearchParams({ jobId: id })}`, "/app/dispatch");
  return <FieldWorkspace initial={manifest} jobId={id} />;
}
