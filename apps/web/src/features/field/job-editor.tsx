"use client";

import { useState } from "react";
import { ConfirmationDialog } from "../../components/confirmation-dialog";
import { JobDetailView } from "../jobs/job-detail";
import { checklistItems, nextStep, type ChecklistItem, type FieldChange, type FieldJob, type StockPart } from "./types";

export function JobEditor({ fieldJob, timeZone, stock, disabled, submit }: {
  fieldJob: FieldJob;
  timeZone: string;
  stock: StockPart[];
  disabled: boolean;
  submit: (change: FieldChange) => Promise<void>;
}) {
  const { job, events, checklist, parts } = fieldJob;
  const active = job.status === "ARRIVED";
  const canViewWork = active || job.status === "COMPLETED";
  const next = nextStep[job.status];
  const completion = next?.status === "COMPLETED";
  const [confirming, setConfirming] = useState(false);

  return (
    <JobDetailView detail={{ job, events, timeZone }}>
      {canViewWork && (
        <div className="mt-4 space-y-5 border-t border-neutral-200 pt-5">
          <fieldset disabled={disabled || !active}>
            <legend className="font-semibold">Work checklist</legend>
            <div className="mt-2 divide-y divide-neutral-100">
              {(Object.entries(checklistItems) as [ChecklistItem, string][]).map(([key, label]) => (
                <label key={key} className="flex min-h-12 items-center gap-3 py-2 text-sm leading-5">
                  <input type="checkbox" className="size-5 accent-neutral-900" checked={!!checklist[key]}
                    onChange={(event) => void submit({ type: "checklist", item: key, checked: event.currentTarget.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <section aria-labelledby="van-stock-title">
            <h2 id="van-stock-title" className="font-semibold">Van stock</h2>
            {stock.length ? <ul className="mt-2 space-y-2">
              {stock.map(({ sku, name, quantity }) => (
                <li key={sku} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-neutral-600">{quantity} in van</p>
                  </div>
                  {active && <button type="button" aria-label={`Add ${name}`} disabled={disabled || quantity < 1}
                    onClick={() => void submit({ type: "part", sku, quantity: 1 })}
                    className="rl-button min-h-12 shrink-0 text-neutral-900 hover:bg-neutral-50">
                    Add part
                  </button>}
                </li>
              ))}
            </ul> : <p className="mt-2 text-sm text-neutral-600">No van stock is available.</p>}
          </section>
          {parts.length > 0 && <section aria-labelledby="used-parts-title">
            <h2 id="used-parts-title" className="font-semibold">Parts used</h2>
            <ul className="mt-2 space-y-1 text-sm text-neutral-700">
              {parts.map((part) => <li key={part.id}>{part.quantity} × {part.name}</li>)}
            </ul>
          </section>}
        </div>
      )}
      {next && (
        <button type="button" disabled={disabled} aria-haspopup={completion ? "dialog" : undefined}
          onClick={() => {
            if (completion) setConfirming(true);
            else void submit({ type: "status", status: next.status, version: job.version });
          }}
          className="rl-button rl-button-primary mt-4 min-h-12 w-full">
          {next.label}
        </button>
      )}
      {completion && <ConfirmationDialog open={confirming} title="Complete job?" description="Review the checklist and parts used before finishing this work order."
        dismissLabel="Keep working" confirmLabel="Confirm completion" onDismiss={() => setConfirming(false)} onConfirm={() => {
          setConfirming(false);
          if (!disabled) return submit({ type: "status", status: "COMPLETED", version: job.version });
        }} />}
    </JobDetailView>
  );
}
