import type { Metadata } from "next";
import { DemoLogin } from "../../features/auth/demo-login";
import { getDemoTenants } from "../../features/auth/server-api";
import { Brand } from "../../features/workspace/brand";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const tenants = await getDemoTenants().catch(() => null);

  return (
    <main className="mx-auto w-full max-w-sm px-5 pt-[clamp(3rem,12vh,8rem)] pb-10">
      <Brand />
      <h1 className="rl-page-title mt-6">Sign in</h1>
      {tenants?.length ? (
        <DemoLogin tenants={tenants} />
      ) : (
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          {tenants ? "Sign-in is disabled." : "Sign-in is unavailable. Try refreshing the page."}
        </p>
      )}
    </main>
  );
}
