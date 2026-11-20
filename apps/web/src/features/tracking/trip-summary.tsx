import type { Trip } from "./types";

export function TripSummary({ trip }: { trip: Trip }) {
  return (
    <div>
      <p className="text-sm font-medium">{trip.technicianName} · {trip.source === "demo" ? "Route replay" : "Device GPS"}</p>
      <p className="mt-1 text-sm text-neutral-600">
        {trip.etaMinutes === null ? "Road ETA unavailable" : `Approx. ${trip.etaMinutes} min to arrival`}
      </p>
    </div>
  );
}
