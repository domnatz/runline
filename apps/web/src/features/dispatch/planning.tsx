"use client";

import { useEffect, useState } from "react";
import type { Technician } from "../jobs/types";

export type Appointment = {
  technicianId: string; serviceDate: string; startMinute: number; durationMinutes: number; version: number;
};

type Match = Technician & { missingSkills: string[]; distanceMeters: number | null; nearby: boolean | null; available: boolean };
type Leg = {
  direction: "before" | "after"; title: string; gapMinutes: number; driveMinutes: number | null;
  status: "OVERLAP" | "UNAVAILABLE" | "SHORT_GAP" | "ENOUGH_TIME";
};

export function useMatches(jobId: string, { serviceDate, startMinute, durationMinutes }: Appointment, revision: string) {
  const valid = serviceDate && startMinute >= 420 && startMinute % 15 === 0
    && durationMinutes >= 15 && durationMinutes % 15 === 0 && startMinute + durationMinutes <= 1140;
  const query = valid ? `?${new URLSearchParams({
    date: serviceDate, startMinute: String(startMinute), durationMinutes: String(durationMinutes),
  })}` : "";
  const [result, setResult] = useState<{ query: string; matches: Match[] }>();
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/dispatch/jobs/${jobId}/matches${query}`, {
        cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      }).then(async (response) => {
        if (!response.ok) return;
        const { matches }: { matches: Match[] } = await response.json();
        if (!controller.signal.aborted) setResult({ query, matches });
      }).catch(() => undefined);
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [jobId, query, revision]);
  return result?.query === query ? result.matches : null;
}

export function matchDetail(match: Match, recommended: boolean) {
  const distance = match.distanceMeters === null ? null : `${(match.distanceMeters / 1000).toFixed(1)} km away`;
  const skills = match.missingSkills.length ? `Missing ${match.missingSkills.join(", ")}` : null;
  return [recommended ? "Recommended" : null, match.available ? null : "Booked", distance, skills].filter(Boolean).join(" · ");
}

export function DriveTimePreview({ jobId, draft, revision }: { jobId: string; draft: Appointment; revision: string }) {
  const { technicianId, serviceDate, startMinute, durationMinutes, version } = draft;
  const ready = technicianId && serviceDate && Number.isFinite(startMinute) && durationMinutes >= 15;
  const [result, setResult] = useState<{ key: string; legs: Leg[] | null }>();
  const key = `${technicianId}:${serviceDate}:${startMinute}:${durationMinutes}:${version}:${revision}`;

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        let legs: Leg[] | null = null;
        try {
          const response = await fetch(`/api/dispatch/jobs/${jobId}/drive-time`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ technicianId, serviceDate, startMinute, durationMinutes, version }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
          });
          if (response.ok) legs = (await response.json() as { legs: Leg[] }).legs;
        } catch {
          // keep the assignment form available if the preview cannot load.
        }
        if (!controller.signal.aborted) setResult({ key, legs });
      })();
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [jobId, key, ready, technicianId, serviceDate, startMinute, durationMinutes, version]);

  if (!ready) return null;
  return (
    <section aria-label="Drive-time preview" className="mt-4 space-y-2 border-t border-neutral-200 pt-3 text-sm">
      <h3 className="font-semibold">Drive time</h3>
      <div aria-live="polite">
        {result?.key !== key ? <p>Checking travel time…</p> : result.legs === null ? <p>Drive-time estimate unavailable.</p>
          : result.legs.length === 0 ? <p>No adjacent appointments for this technician.</p> : (
            <ul className="space-y-2">
              {result.legs.map(({ direction, title, gapMinutes, driveMinutes, status }) => (
                <li key={direction}>
                  <p className="font-medium">{direction === "before" ? "From" : "To"} {title}</p>
                  <p className={status === "SHORT_GAP" || status === "OVERLAP" ? "font-medium text-amber-900" : "text-neutral-600"}>
                    {status === "OVERLAP" ? `Appointments overlap by ${Math.abs(gapMinutes)} min`
                      : status === "UNAVAILABLE" ? `Drive-time estimate unavailable · ${gapMinutes} min gap`
                        : `${status === "SHORT_GAP" ? "Insufficient travel time · " : ""}${driveMinutes} min drive · ${gapMinutes} min gap`}
                  </p>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  );
}
