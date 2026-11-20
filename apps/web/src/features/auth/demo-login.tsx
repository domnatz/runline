"use client";

import { useState, type FormEvent } from "react";
import { SelectField } from "../../components/select-field";
import type { DemoTenant } from "./server-api";

const roles = [
  { value: "DISPATCHER", label: "Dispatcher" },
  { value: "TECHNICIAN", label: "Technician" },
  { value: "ADMIN", label: "Admin" },
];

export function DemoLogin({ tenants }: { tenants: DemoTenant[] }) {
  const [pending, setPending] = useState<"staff" | "customer" | null>(null);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const persona = form.get("persona");
    const customer = (event.nativeEvent as SubmitEvent).submitter?.id === "open-customer-tracking";
    setPending(customer ? "customer" : "staff");
    setError("");

    try {
      const response = await fetch(customer ? "/api/demo/customer-link" : "/api/demo/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(customer ? { tenantSlug: form.get("tenant") } : { tenantSlug: form.get("tenant"), persona }),
      });
      if (!response.ok) throw new Error("Sign-in failed");
      if (customer) {
        const { path }: { path: string } = await response.json();
        window.location.assign(path);
        return;
      }
      const { clearActiveRoute } = await import("../field/storage");
      await clearActiveRoute().catch(() => undefined);
      window.location.replace(persona === "TECHNICIAN" ? "/tech" : "/app/dispatch");
    } catch {
      setError(customer ? "Could not open customer tracking. Try again." : "Could not sign in. Try again.");
      setPending(null);
    }
  }

  return (
    <form onSubmit={signIn} className="mt-5 space-y-4">
      <div className="grid gap-2">
        <label htmlFor="tenant" className="block text-sm font-medium text-neutral-800">Organization</label>
        <SelectField id="tenant" name="tenant" placeholder="Choose an organization" required disabled={pending !== null}
          options={tenants.map(({ slug, name }) => ({ value: slug, label: name }))} />
      </div>
      <div className="grid gap-2">
        <label htmlFor="persona" className="block text-sm font-medium text-neutral-800">Role</label>
        <SelectField id="persona" name="persona" defaultValue="DISPATCHER" disabled={pending !== null} options={roles} />
      </div>
      <button
        type="submit"
        disabled={pending !== null}
        className="rl-button rl-button-primary min-h-12 w-full"
      >
        {pending === "staff" ? "Signing in…" : "Sign in"}
      </button>
      <button id="open-customer-tracking" type="submit" disabled={pending !== null}
        className="mx-auto flex min-h-11 items-center px-2 text-sm font-semibold text-neutral-900 underline underline-offset-4 hover:text-orange-800 disabled:opacity-70">
        {pending === "customer" ? "Opening portal…" : "Open customer tracking"}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
