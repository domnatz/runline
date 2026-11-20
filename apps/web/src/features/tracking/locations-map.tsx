"use client";

import dynamic from "next/dynamic";
import type { MapCanvasProps } from "./map-canvas";

const MapCanvas = dynamic(() => import("./map-canvas").then((module) => module.MapCanvas), {
  ssr: false,
  loading: () => <p className="rl-map-frame grid place-items-center rounded-lg bg-neutral-50 text-sm text-neutral-600">Loading location map…</p>,
});

export function LocationsMap(props: MapCanvasProps) {
  return <div data-dispatch-map={props.dispatch || undefined}><MapCanvas {...props} /></div>;
}
