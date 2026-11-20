/// <reference lib="webworker" />

import { isFieldNavigation, shellCache, shellUrl } from "./offline-shell";
import { FieldSessionExpired, flushFieldQueue, syncTag } from "./sync";

const worker = globalThis as unknown as ServiceWorkerGlobalScope;
let preparing: Promise<void> | undefined;

async function cacheShell() {
  const cache = await caches.open(shellCache);
  const response = await fetch(shellUrl, { cache: "reload", credentials: "same-origin" });
  if (!response.ok) throw new Error("The offline technician shell is unavailable");
  const html = await response.clone().text();
  const assets = new Set(Array.from(html.matchAll(/(?:href|src)="(\/_next\/static\/[^" ]+)"/g), (match) => match[1]!));
  if (!assets.size) throw new Error("The offline technician assets are unavailable");

  // publish the offline shell after all of its build assets have been saved.
  await cache.addAll([...assets]);
  await cache.put(shellUrl, response);
}

function prepareShell() {
  preparing ??= cacheShell().finally(() => { preparing = undefined; });
  return preparing;
}

worker.addEventListener("install", (event) => {
  event.waitUntil(prepareShell().then(() => worker.skipWaiting()));
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(worker.clients.claim());
});

worker.addEventListener("message", (event) => {
  if (event.data !== "prepare-field-shell") return;
  event.waitUntil(prepareShell().catch(() => undefined));
});

worker.addEventListener("sync", (rawEvent) => {
  const event = rawEvent as ExtendableEvent & { tag: string };
  if (event.tag !== syncTag) return;
  event.waitUntil(flushFieldQueue().catch((error: unknown) => {
    if (!(error instanceof FieldSessionExpired)) throw error;
  }));
});

worker.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== worker.location.origin) return;

  if (request.mode === "navigate" && (isFieldNavigation(url.pathname) || url.pathname === shellUrl)) {
    event.respondWith(fetch(request).then((response) => {
      if (response.status >= 500) throw new Error("The technician workspace is unavailable");
      return response;
    }).catch(async () => {
      const page = await (await caches.open(shellCache)).match(shellUrl);
      if (!page) return new Response("Connect and open your technician route to download it.", { status: 503 });
      if (url.pathname === shellUrl) return page;
      const target = new URL(shellUrl, url.origin);
      target.searchParams.set("target", url.pathname + url.search);
      return Response.redirect(target, 302);
    }));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => (await (await caches.open(shellCache)).match(request)) ?? fetch(request))());
  }
});
