"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { sendJobAction } from "../jobs/client-api";

export function CustomerLink({ jobId, copyOnCreate = false }: { jobId: string; copyOnCreate?: boolean }) {
  const fieldId = useId();
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function createLink() {
    setPending(true);
    setMessage("");
    try {
      const response = await sendJobAction(`/api/tracking/jobs/${jobId}/link`, "POST");
      const { path }: { path: string } = await response.json();
      const trackingUrl = new URL(path, window.location.origin).href;
      setUrl(trackingUrl);
      if (copyOnCreate) await copyLink(trackingUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the customer link.");
    } finally {
      setPending(false);
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setMessage("");
      toast.success("Customer link copied.");
    } catch {
      setMessage("Select the link field to copy it manually.");
    }
  }

  return (
    <div className="space-y-2">
      {url ? (
        <>
          <label htmlFor={fieldId} className="block text-sm font-medium text-neutral-800">Customer link</label>
          <input id={fieldId} readOnly value={url} onFocus={(event) => event.currentTarget.select()}
            className="rl-control bg-neutral-50" />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-neutral-900">
            <button type="button" onClick={() => void copyLink(url)} className="min-h-11 hover:underline">Copy link</button>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center hover:underline">Open customer portal</a>
          </div>
        </>
      ) : (
        <button type="button" onClick={createLink} disabled={pending}
          className={`rl-button min-h-11 ${copyOnCreate ? "text-neutral-900" : "rl-button-primary"}`}>
          {pending ? "Creating link…" : copyOnCreate ? "Copy customer tracking link" : "Create customer link"}
        </button>
      )}
      {message && <p role="status" className="text-sm text-neutral-700">{message}</p>}
    </div>
  );
}
