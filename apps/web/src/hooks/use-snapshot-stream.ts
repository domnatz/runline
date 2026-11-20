"use client";

import { useEffect, useState } from "react";

type Connection = "connecting" | "live" | "reconnecting" | "unavailable" | "expired";

export function useSnapshotStream<T>(path: string | null) {
  const [state, setState] = useState<{ snapshot: T | null; connection: Connection }>({
    snapshot: null, connection: "connecting",
  });

  useEffect(() => {
    if (!path) return;
    const url = path;
    let active: EventSource | null = null;
    let expired = false;

    function close() {
      active?.close();
      active = null;
    }

    function connect() {
      if (expired || active || !navigator.onLine) return;
      const stream = new EventSource(url);
      active = stream;
      stream.addEventListener("snapshot", (event: MessageEvent<string>) => {
        if (active === stream) setState({ snapshot: JSON.parse(event.data) as T, connection: "live" });
      });
      stream.addEventListener("expired", () => {
        if (active !== stream) return;
        expired = true;
        close();
        setState({ snapshot: null, connection: "expired" });
      });
      stream.onerror = () => {
        if (active !== stream) return;
        const unavailable = stream.readyState === EventSource.CLOSED;
        if (unavailable) close();
        setState((previous) => ({ ...previous, connection: unavailable ? "unavailable" : "reconnecting" }));
      };
    }

    function disconnect() {
      close();
      if (!expired) setState((previous) => ({ ...previous, connection: "reconnecting" }));
    }

    connect();
    window.addEventListener("online", connect);
    window.addEventListener("offline", disconnect);
    return () => {
      close();
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", disconnect);
    };
  }, [path]);

  return state;
}
