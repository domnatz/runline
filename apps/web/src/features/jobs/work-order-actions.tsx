"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmationDialog } from "../../components/confirmation-dialog";
import { SelectField } from "../../components/select-field";
import { sendJobAction } from "./client-api";
import { DestinationFields, readDestination } from "./destination-fields";
import { priorityLabels } from "./format";
import type { Job } from "./types";

const priorities = Object.entries(priorityLabels).map(([value, label]) => ({ value, label }));
type Action = "edit" | "cancel";

export function WorkOrderActions({ job }: { job: Job }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const router = useRouter();
  const priorityId = useId();
  const busy = pending || refreshing;

  function toggleEdit() {
    setError("");
    setEditing((open) => !open);
  }

  function showConfirmation(open: boolean) {
    setError("");
    setConfirming(open);
  }

  async function submit(fields: FormData, action: Action) {
    const path = `/api/jobs/${job.id}`;
    setPending(true);
    setError("");
    try {
      if (action === "edit") {
        const { latitude, longitude, ...details } = Object.fromEntries(fields);
        const destination = readDestination(latitude, longitude);
        await sendJobAction(path, "PATCH", { ...details, destination, version: job.version });
        toast.success("Work order details saved.");
        setEditing(false);
      } else {
        await sendJobAction(`${path}/cancel`, "POST", { reason: fields.get("reason"), version: job.version });
        toast.success("Work order cancelled.");
        setConfirming(false);
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the work order.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rl-button min-h-11" onClick={toggleEdit} aria-expanded={editing} disabled={busy}>
          Edit details
        </button>
        <button type="button" className="rl-button min-h-11 text-red-700" onClick={() => showConfirmation(true)} aria-haspopup="dialog" disabled={busy}>
          Cancel work order
        </button>
      </div>
      {editing && (
        <form onSubmit={(event) => {
          event.preventDefault();
          void submit(new FormData(event.currentTarget), "edit");
        }} className="space-y-3 border-t border-neutral-200 pt-4">
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">Service address
              <input name="address" defaultValue={job.address} required maxLength={200} className="rl-control" />
            </label>
            <div className="grid gap-1.5 text-sm font-medium">
              <label htmlFor={priorityId}>Priority</label>
              <SelectField id={priorityId} name="priority" defaultValue={job.priority} options={priorities} disabled={busy} />
            </div>
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Notes
              <textarea name="notes" defaultValue={job.notes} maxLength={1000} rows={3} className="rl-control py-2" />
            </label>
            <DestinationFields hint="Set coordinates for the new address to keep its map pin and ETA." />
          </fieldset>
          <button type="submit" disabled={busy} className="rl-button rl-button-primary min-h-11">
            {pending && !confirming ? "Saving…" : "Save changes"}
          </button>
          {!confirming && error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </form>
      )}
      <ConfirmationDialog open={confirming} title="Cancel work order?" description="Cancelling frees the appointment slot and records the reason in the audit history."
        dismissLabel="Keep work order" confirmLabel={pending ? "Cancelling…" : "Confirm cancellation"} busy={busy} destructive
        onDismiss={() => showConfirmation(false)} onConfirm={(fields) => submit(fields, "cancel")} error={error}>
        <label className="grid gap-1.5 text-sm font-medium">Cancellation reason
          <textarea name="reason" required maxLength={500} rows={3} className="rl-control py-2" disabled={busy} />
        </label>
      </ConfirmationDialog>
    </div>
  );
}
