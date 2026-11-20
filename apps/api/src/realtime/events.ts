import { setMaxListeners } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

type Notify = () => void;
export type RealtimeChannel = "runline_tracking" | "runline_inventory";

export function createRealtimeEvents() {
  const listeners = new Map<string, Set<Notify>>();
  const controller = new AbortController();
  const { signal } = controller;
  setMaxListeners(0, signal);

  function subscribe(channel: RealtimeChannel, tenantId: string, jobId: string | undefined, notify: Notify) {
    const key = jobId ? `${channel}:${tenantId}:${jobId}` : `${channel}:${tenantId}`;
    const group = listeners.get(key) ?? new Set<Notify>();
    group.add(notify);
    listeners.set(key, group);
    return () => {
      group.delete(notify);
      if (!group.size) listeners.delete(key);
    };
  }

  function emit(key: string) {
    for (const notify of listeners.get(key) ?? []) notify();
  }

  async function listen() {
    while (!signal.aborted) {
      const client = new pg.Client({ user: "runline_app", connectionTimeoutMillis: 3000, keepAlive: true });
      const closed = new Promise<void>((resolve) => {
        client.once("end", resolve);
        client.on("error", () => resolve());
      });
      const end = () => void client.end().catch(() => undefined);
      signal.addEventListener("abort", end, { once: true });
      client.on("notification", ({ channel, payload }) => {
        if (!payload) return;
        const tenantId = payload.split(":", 1)[0];
        if (!tenantId) return;
        emit(`${channel}:${tenantId}`);
        if (payload !== tenantId) emit(`${channel}:${payload}`);
      });
      try {
        await client.connect();
        await client.query("LISTEN runline_tracking; LISTEN runline_inventory");
        for (const group of listeners.values()) {
          for (const notify of group) notify();
        }
        await closed;
      } catch {
        if (!signal.aborted) console.error("Realtime notifications will reconnect");
      } finally {
        signal.removeEventListener("abort", end);
        await client.end().catch(() => undefined);
      }
      await delay(1000, undefined, { signal }).catch(() => undefined);
    }
  }

  void listen();
  return { subscribe, signal, close: () => controller.abort() };
}

export type RealtimeEvents = ReturnType<typeof createRealtimeEvents>;
