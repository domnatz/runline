import { shellCache, shellUrl } from "./offline-shell";
import { syncTag } from "./sync";

export async function prepareOfflineShell() {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.register("/tech-sw.js", { scope: "/tech", updateViaCache: "none" });
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
  ]);
  if (!ready?.active || ready.scope !== registration.scope) return false;

  const cached = await (await caches.open(shellCache)).match(shellUrl);
  if (!cached) return false;
  ready.active.postMessage("prepare-field-shell");
  return true;
}

export async function scheduleBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const capable = registration as (ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }) | undefined;
  await capable?.sync?.register(syncTag);
}
