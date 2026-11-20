import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireWorkspaceSession } from "../../features/auth/server-api";
import { WorkspaceShell } from "../../features/workspace/workspace-shell";

export default async function TechnicianLayout({ children }: { children: ReactNode }) {
  const session = await requireWorkspaceSession();
  if (session.role !== "TECHNICIAN") redirect("/app/dispatch");
  return <WorkspaceShell session={session}>{children}</WorkspaceShell>;
}
