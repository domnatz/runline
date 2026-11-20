import { z } from "zod";
import type { Coordinates } from "../tracking/contracts.js";

const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const routeResponse = z.object({
  code: z.literal("Ok"),
  routes: z.array(z.object({
    duration: z.number().nonnegative(),
    geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(coordinate).min(2).max(4000) }),
  })).min(1),
});

type RoadRoute = { seconds: number; line: [number, number][] };
const origin = process.env.RUNLINE_OSRM_ORIGIN ?? "http://127.0.0.1:5000";
const routes = new Map<string, { expires: number; result: Promise<RoadRoute | null> }>();

export function roadRoute(from: Coordinates | null, to: Coordinates | null): Promise<RoadRoute | null> {
  if (!from || !to) return Promise.resolve(null);
  const points = [from, to].map(({ longitude, latitude }) => `${longitude.toFixed(5)},${latitude.toFixed(5)}`).join(";");
  const now = Date.now();
  const cached = routes.get(points);
  if (cached && cached.expires > now) return cached.result;

  const entry = {
    expires: now + 60000,
    result: fetchRoad(points).then((route) => {
      if (!route) entry.expires = Date.now() + 3000;
      return route;
    }),
  };
  routes.delete(points);
  routes.set(points, entry);
  if (routes.size > 512) {
    const oldest = routes.keys().next().value;
    if (oldest) routes.delete(oldest);
  }
  return entry.result;
}

async function fetchRoad(points: string): Promise<RoadRoute | null> {
  try {
    const url = new URL(`/route/v1/driving/${points}`, origin);
    url.search = new URLSearchParams({ overview: "simplified", geometries: "geojson", radiuses: "350;350" }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(1200), redirect: "error" });
    if (!response.ok) return null;
    const parsed = routeResponse.safeParse(await response.json());
    const route = parsed.success ? parsed.data.routes[0] : undefined;
    return route ? { seconds: route.duration, line: route.geometry.coordinates } : null;
  } catch {
    return null;
  }
}
