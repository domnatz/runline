import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspaceSession } from "../../features/auth/server-api";
import { roleLabels } from "../../features/workspace/workspace-shell";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage() {
  const session = await requireWorkspaceSession();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">{session.tenantName}</h1>
        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 text-sm">
          <div>
            <dt className="text-neutral-600">Signed in as</dt>
            <dd className="mt-1 font-medium">{session.userName}</dd>
          </div>
          <div>
            <dt className="text-neutral-600">Role</dt>
            <dd className="mt-1 font-medium">{roleLabels[session.role]}</dd>
          </div>
        </dl>
        <Link href="/app/dispatch" className="rl-button rl-button-primary mt-6">
          Open dispatch board
        </Link>
      </section>
    </main>
  );
}
