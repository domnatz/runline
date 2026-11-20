import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

export type DemoTenant = { slug: string; name: string };

export type Session = {
  tenantId: string;
  userName: string;
  tenantName: string;
  role: "ADMIN" | "DISPATCHER" | "TECHNICIAN";
};

export const sessionCookie = "runline_session";
const apiOrigin = process.env.RUNLINE_API_ORIGIN ?? "http://127.0.0.1:4000";

export async function getFromApi(path: string, headers?: HeadersInit) {
  return fetch(new URL(path, apiOrigin), {
    cache: "no-store",
    headers,
    signal: AbortSignal.timeout(5000),
  });
}

export async function getDemoTenants(): Promise<DemoTenant[]> {
  const response = await getFromApi("/api/demo/tenants");
  if (!response.ok) throw new Error("Organization list is unavailable");
  const data: { tenants: DemoTenant[] } = await response.json();
  return data.tenants;
}

export async function getSession(token: string): Promise<Session | null> {
  const response = await getFromApi("/api/session", {
    cookie: `${sessionCookie}=${encodeURIComponent(token)}`,
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("The workspace is unavailable");
  return response.json();
}

async function requireSessionCookie() {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) redirect("/login");
  return token;
}

export const requireWorkspaceSession = cache(async () => {
  const session = await getSession(await requireSessionCookie());
  if (!session) redirect("/login");
  return session;
});

export async function getWorkspaceData<T>(path: string, deniedPath: string): Promise<T> {
  const token = await requireSessionCookie();
  const response = await getFromApi(path, { cookie: `${sessionCookie}=${encodeURIComponent(token)}` });
  if (response.status === 401) redirect("/login");
  if (response.status === 403) redirect(deniedPath);
  if (response.status === 404 || response.status === 400) notFound();
  if (!response.ok) throw new Error("The workspace is unavailable");
  return response.json();
}
