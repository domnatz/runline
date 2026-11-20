import Link from "next/link";
import type { ReactNode } from "react";
import type { Session } from "../auth/server-api";
import { SignOut } from "../auth/sign-out";
import { Brand } from "./brand";
import { WorkspaceNavigation } from "./workspace-navigation";

export const roleLabels = { ADMIN: "Admin", DISPATCHER: "Dispatcher", TECHNICIAN: "Technician" };

function WorkspaceHeader({ session, field }: { session: Session; field: boolean }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className={`grid items-center gap-x-3 px-4 pt-2 sm:gap-x-4 sm:px-6 ${field
        ? "mx-auto max-w-2xl grid-cols-[auto_minmax(0,1fr)] pb-2"
        : "grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:pt-0"}`}>
        <Link href={field ? "/tech" : "/app/dispatch"} className="justify-self-start"><Brand /></Link>
        {!field && <WorkspaceNavigation admin={session.role === "ADMIN"} />}
        <div className="flex min-w-0 items-center justify-end gap-2 text-right sm:gap-3">
          <div className="min-w-0 leading-tight">
            <p className="text-xs font-semibold [overflow-wrap:anywhere] sm:text-sm">{session.tenantName}</p>
            <p className="text-xs text-neutral-600">{session.userName}</p>
          </div>
          <SignOut />
        </div>
      </div>
    </header>
  );
}

export function WorkspaceShell({ session, children }: { session: Session; children: ReactNode }) {
  if (session.role === "TECHNICIAN") {
    return (
      <>
        <WorkspaceHeader session={session} field />
        {children}
      </>
    );
  }
  return (
    <div className="rl-workspace">
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">
        Skip to content
      </a>
      <WorkspaceHeader session={session} field={false} />
      <div id="workspace-content" tabIndex={-1} className="min-w-0">{children}</div>
    </div>
  );
}
