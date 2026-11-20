import type { Response } from "express";
import type { RealtimeChannel, RealtimeEvents } from "./events.js";

export function streamSnapshot(
  response: Response,
  events: RealtimeEvents,
  scope: { channel: RealtimeChannel; tenantId: string; jobId?: string; expiresAt: number },
  readSnapshot: () => Promise<unknown>,
) {
  if (events.signal.aborted || response.destroyed) {
    response.end();
    return;
  }

  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "private, no-store, no-transform",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  response.write("retry: 1500\n\n");

  let lastSnapshot = "";
  let stopped = false;
  let running = false;
  let dirty = false;

  function refresh() {
    dirty = true;
    if (!running) void publish();
  }

  async function publish() {
    running = true;
    try {
      while (dirty && !stopped) {
        dirty = false;
        const payload = JSON.stringify(await readSnapshot());
        if (stopped) break;
        if (Date.now() >= scope.expiresAt) {
          expire();
          break;
        }
        if (payload !== lastSnapshot) {
          lastSnapshot = payload;
          if (!response.write(`event: snapshot\ndata: ${payload}\n\n`)) stop();
        }
      }
    } catch {
      stop();
    } finally {
      running = false;
    }
  }

  function expire() {
    response.write("event: expired\ndata: {}\n\n");
    stop();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    clearTimeout(expiry);
    unsubscribe();
    events.signal.removeEventListener("abort", stop);
    response.end();
  }

  const unsubscribe = events.subscribe(scope.channel, scope.tenantId, scope.jobId, refresh);
  const heartbeat = setInterval(() => {
    if (response.write(": heartbeat\n\n")) refresh();
    else stop();
  }, 10000);
  const expiry = setTimeout(expire, Math.max(0, scope.expiresAt - Date.now()));
  response.once("close", stop);
  events.signal.addEventListener("abort", stop, { once: true });
  refresh();
}
