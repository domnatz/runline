"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type ConfirmationDialogProps = {
  open: boolean;
  title: string;
  description: string;
  dismissLabel: string;
  confirmLabel: string;
  onDismiss: () => void;
  onConfirm: (fields: FormData) => void | Promise<void>;
  busy?: boolean;
  destructive?: boolean;
  error?: string;
  children?: ReactNode;
};

export function ConfirmationDialog({ open, title, description, dismissLabel, confirmLabel, onDismiss, onConfirm,
  busy = false, destructive = false, error, children }: ConfirmationDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const details = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open === open) return;
    if (open) element.showModal();
    else element.close();
  }, [open]);

  return (
    <dialog ref={dialog} aria-labelledby={heading} aria-describedby={details}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
      className="m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overscroll-contain rounded-lg border border-neutral-200 bg-white p-5 text-neutral-900 shadow-xl backdrop:bg-neutral-950/45 sm:p-6">
      <h2 id={heading} className="text-lg font-semibold">{title}</h2>
      <p id={details} className="mt-1.5 text-sm leading-6 text-neutral-700">{description}</p>
      {open && <form className="mt-4 space-y-3" onSubmit={(event) => {
        event.preventDefault();
        if (!busy) void onConfirm(new FormData(event.currentTarget));
      }}>
        {children}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="rl-button min-h-11" onClick={onDismiss} disabled={busy}>{dismissLabel}</button>
          <button type="submit" className={`rl-button min-h-11 ${destructive
            ? "border-red-700 bg-red-700 text-white hover:border-red-800 hover:bg-red-800" : "rl-button-primary"}`} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </form>}
    </dialog>
  );
}
