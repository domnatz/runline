"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { SelectField } from "../../components/select-field";
import { sendJobAction } from "../jobs/client-api";
import { formatTime } from "../jobs/format";
import type { Job, Technician } from "../jobs/types";
import { DriveTimePreview, matchDetail, useMatches, type Appointment } from "./planning";

const control = "rl-control min-w-0";

function readAppointment(formElement: HTMLFormElement, version: number): Appointment {
  const form = new FormData(formElement);
  const start = String(form.get("start"));
  const [hour = 0, minute = 0] = start.split(":").map(Number);
  return { technicianId: String(form.get("technician") ?? ""), serviceDate: String(form.get("date") ?? ""),
    startMinute: start ? hour * 60 + minute : Number.NaN, durationMinutes: Number(form.get("duration")), version };
}

export function ScheduleForm({ job, date, technicians, revision }: {
  job: Job; date: string; technicians: Technician[]; revision: string;
}) {
  const router = useRouter();
  const fields = useId();
  const [pending, setPending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Appointment>({
    technicianId: job.technicianId ?? "", serviceDate: job.serviceDate ?? date,
    startMinute: job.startMinute ?? 780, durationMinutes: job.durationMinutes ?? 60, version: job.version,
  });
  const matches = useMatches(job.id, draft, revision);
  const recommended = matches?.find(({ missingSkills, available }) => available && !missingSkills.length);
  const options = matches
    ? matches.map((match) => ({ value: match.id, label: match.name, detail: matchDetail(match, match.id === recommended?.id) }))
    : technicians.map(({ id, name }) => ({ value: id, label: name }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const appointment = readAppointment(event.currentTarget, job.version);
    const { serviceDate } = appointment;
    setPending(true);
    setError("");
    try {
      await sendJobAction(`/api/jobs/${job.id}/schedule`, "PUT", appointment);
      toast.success(job.status === "UNASSIGNED" ? "Work order assigned." : "Appointment updated.");
      startTransition(() => {
        if (serviceDate !== date) router.replace(`/app/dispatch?${new URLSearchParams({ date: serviceDate, job: job.id })}`);
        else router.refresh();
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the appointment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} onChange={(event) => setDraft(readAppointment(event.currentTarget, job.version))} className="mt-5">
      {!!job.requiredSkills?.length && <p className="mb-3 text-sm text-neutral-700">Required skills · {job.requiredSkills.join(", ")}</p>}
      <fieldset disabled={pending || refreshing} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 text-sm font-medium">
          <label htmlFor={`${fields}-technician`}>Technician</label>
          <SelectField id={`${fields}-technician`} name="technician" placeholder="Choose a technician" required
            defaultValue={job.technicianId ?? undefined} disabled={pending || refreshing || technicians.length === 0} options={options} />
        </div>
        <label className="grid gap-1.5 text-sm font-medium">
          Appointment date
          <input type="date" name="date" required defaultValue={job.serviceDate ?? date} className={control} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Starts at
          <input type="time" name="start" min="07:00" max="18:45" step="900" required
            defaultValue={formatTime(job.startMinute ?? 780)} className={control} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Duration in minutes
          <input type="number" name="duration" min={15} max={720} step={15} required
            defaultValue={job.durationMinutes ?? 60} className={control} />
        </label>
      </fieldset>
      <DriveTimePreview jobId={job.id} draft={draft} revision={revision} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || refreshing || technicians.length === 0}
          className="rl-button rl-button-primary min-h-11">
          {pending || refreshing ? "Saving…" : job.status === "UNASSIGNED" ? "Assign job" : "Update appointment"}
        </button>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </form>
  );
}
