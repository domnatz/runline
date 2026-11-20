"use client";

import { useEffect, useEffectEvent, useState } from "react";

const button = "rl-button min-h-11 text-neutral-900 hover:bg-neutral-50";
type Mode = "device" | "demo";

export function ShareLocation({ jobId, onArrival }: { jobId: string; onArrival: () => Promise<void> }) {
  const path = `/api/tracking/tech/jobs/${jobId}`;
  const [demoReplay, setDemoReplay] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [info, setInfo] = useState("");
  const [stopPending, setStopPending] = useState(false);
  const handleArrival = useEffectEvent(() => {
    setMode(null);
    setInfo("Arrival detected.");
    void onArrival();
  });

  useEffect(() => {
    const controller = new AbortController();
    void fetch(path, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.ok) {
          const { demoReplay }: { demoReplay: boolean } = await response.json();
          if (!controller.signal.aborted) setDemoReplay(demoReplay);
        }
      }).catch(() => undefined);
    return () => controller.abort();
  }, [path]);

  useEffect(() => {
    if (!mode) return;
    const controller = new AbortController();
    let watchId: number | undefined;
    let lastSent = 0;
    let sending = false;

    async function send(data: object) {
      const response = await fetch(`${path}/${mode === "demo" ? "replay" : "location"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok) throw new Error("Could not send the location update.");
      const result: { accepted: boolean; arrived: boolean } = await response.json();
      if (!controller.signal.aborted) {
        if (result.arrived) handleArrival();
        else if (result.accepted) setInfo(mode === "demo" ? "Replaying route positions." : "Sharing live GPS for this job.");
      }
      return result;
    }

    function failed() {
      if (!controller.signal.aborted) {
        setInfo("Could not send the location. Check your connection and try again.");
        setMode(null);
      }
    }

    if (mode === "demo") {
      void (async () => {
        for (let step = 0; step < 4 && !controller.signal.aborted; step += 1) {
          if ((await send({ step })).arrived) return;
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        if (!controller.signal.aborted) setMode(null);
      })().catch(failed);
    } else {
      watchId = navigator.geolocation.watchPosition(({ coords, timestamp }) => {
        if (sending || Date.now() - lastSent < 3000) return;
        sending = true;
        lastSent = Date.now();
        void send({
          latitude: coords.latitude, longitude: coords.longitude, accuracyMeters: coords.accuracy,
          capturedAt: new Date(timestamp).toISOString(),
        }).catch(failed).finally(() => { sending = false; });
      }, () => {
        if (!controller.signal.aborted) {
          setInfo("GPS is unavailable. Check your browser’s location permissions.");
          setMode(null);
        }
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    }
    return () => {
      controller.abort();
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [mode, path]);

  function start(next: Mode) {
    if (next === "device" && !navigator.geolocation) {
      setInfo("Device GPS requires a supported browser and a secure connection.");
      return;
    }
    setInfo(next === "device" ? "Waiting for GPS…" : "Starting route replay…");
    setMode(next);
  }

  async function stop() {
    setMode(null);
    setStopPending(true);
    try {
      const response = await fetch(`${path}/location`, { method: "DELETE", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Location stop failed");
      setInfo("Location sharing stopped.");
    } catch {
      setInfo("GPS updates stopped. The last position will expire shortly.");
    } finally {
      setStopPending(false);
    }
  }

  return (
    <section aria-label="Location sharing" className="rl-panel space-y-2 p-4">
      <h2 className="font-semibold">Location sharing</h2>
      <p className="text-sm text-neutral-600">Dispatch and this customer can follow your trip. Keep this screen open to share device GPS.</p>
      {mode ? (
        <button type="button" className={button} onClick={() => void stop()}>Stop sharing</button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={stopPending} onClick={() => start("device")}>Share GPS location</button>
          {demoReplay && <button type="button" className={button} disabled={stopPending} onClick={() => start("demo")}>Replay route</button>}
        </div>
      )}
      {info && <p role="status" className="text-sm text-neutral-700">{info}</p>}
    </section>
  );
}
