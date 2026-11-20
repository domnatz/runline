"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { SelectField } from "../../components/select-field";
import { sendJobAction } from "./client-api";
import { DestinationFields, readDestination } from "./destination-fields";
import { priorityLabels } from "./format";

const input = "rl-control min-w-0";
const priorities = Object.entries(priorityLabels).map(([value, label]) => ({ value, label }));

export function CreateJobForm({ initiallyOpen }: { initiallyOpen: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [navigating, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { latitude, longitude, skills, ...details } = Object.fromEntries(form);
    const requiredSkills = String(skills ?? "").split(",").map((skill) => skill.trim().toUpperCase()).filter(Boolean);
    setPending(true);
    setError("");
    try {
      const destination = readDestination(latitude, longitude);
      const response = await sendJobAction("/api/jobs", "POST", { ...details, destination, requiredSkills });
      const { id }: { id: string } = await response.json();
      toast.success("Work order created.");
      startTransition(() => router.push(`/app/jobs/${id}`));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create the work order.");
    } finally {
      setPending(false);
    }
  }

  return (
    <details id="new-work-order" open={initiallyOpen || undefined} className="scroll-mt-3 open:border-b open:border-neutral-200 open:pb-5">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg py-1 text-sm font-semibold text-neutral-900">
        <Plus size={16} aria-hidden="true" />New work order
      </summary>
      <form onSubmit={createOrder} className="mt-3">
        <fieldset disabled={pending || navigating} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">Title<input name="title" required maxLength={100} className={input} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Customer<input name="customerName" required maxLength={100} className={input} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Service address<input name="address" required maxLength={200} className={input} /></label>
          <div className="grid gap-1.5 text-sm font-medium">
            <label htmlFor="new-order-priority">Priority</label>
            <SelectField id="new-order-priority" name="priority" defaultValue="STANDARD" options={priorities}
              disabled={pending || navigating} />
          </div>
          <DestinationFields hint="Optional. Used for ETA and automatic arrival." />
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
            Required skill tags <span className="sr-only">(optional, comma-separated)</span>
            <input name="skills" maxLength={247} placeholder="EPA-608, REFRIGERATION" className={input} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
            Notes <span className="sr-only">(optional)</span>
            <textarea name="notes" maxLength={1000} rows={3} className="rl-control py-3" />
          </label>
        </fieldset>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending || navigating}
            className="rl-button rl-button-primary min-h-11">
            {pending || navigating ? "Creating…" : "Create work order"}
          </button>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      </form>
    </details>
  );
}
