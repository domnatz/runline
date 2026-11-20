"use client";

import { addProtocol, LngLatBounds, Map, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapGeoJSONFeature } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { metroManilaCenter, regionalStyle, satelliteImage } from "./regional-style";
import type { Coordinates, JobPin, Trip } from "./types";

const sourceId = "live-locations";
const satelliteId = "regional-satellite";
const pointsLayer = "trip-points";
const selectedPinLayer = "selected-job-pin";
let protocolReady = false;

function registerTiles() {
  if (protocolReady) return;
  setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
  const protocol = new Protocol();
  addProtocol("pmtiles", protocol.tile);
  protocolReady = true;
}

function asPoint({ longitude, latitude }: Coordinates): [number, number] {
  return [longitude, Math.max(-85, Math.min(85, latitude))];
}

function feature(point: [number, number], kind: "van" | "destination" | JobPin["status"], jobId?: string) {
  return { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: point },
    properties: jobId ? { kind, jobId } : { kind } };
}

function geofence({ latitude, longitude }: Coordinates) {
  const rad = 100 / 6_371_000;
  const lat = latitude * Math.PI / 180;
  const lon = longitude * Math.PI / 180;
  const ring = Array.from({ length: 32 }, (_, step) => {
    const bearing = step / 32 * Math.PI * 2;
    const y = Math.asin(Math.sin(lat) * Math.cos(rad) + Math.cos(lat) * Math.sin(rad) * Math.cos(bearing));
    const x = lon + Math.atan2(Math.sin(bearing) * Math.sin(rad) * Math.cos(lat), Math.cos(rad) - Math.sin(lat) * Math.sin(y));
    return [x * 180 / Math.PI, y * 180 / Math.PI];
  });
  const first = ring[0];
  if (first) ring.push(first);
  return { type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [ring] }, properties: {} };
}

function mapData(trips: Trip[], jobs: JobPin[]) {
  const live = trips.flatMap(({ position, destination, route }) => {
    const van = asPoint(position);
    if (!destination) return [feature(van, "van")];
    return [
      ...(route ? [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: route }, properties: {} }] : []),
      feature(van, "van"),
      ...(jobs.length ? [] : [feature(asPoint(destination), "destination"), geofence(destination)]),
    ];
  });
  const pins = jobs.flatMap(({ jobId, position, status }) => [feature(asPoint(position), status, jobId), geofence(position)]);
  return { type: "FeatureCollection" as const, features: [...pins, ...live] };
}

function pinJobId(features: MapGeoJSONFeature[] | undefined): string | undefined {
  return features?.find(({ properties }) => typeof properties.jobId === "string")?.properties.jobId;
}

const emptyJobs: JobPin[] = [];

export type MapCanvasProps = {
  trips: Trip[];
  jobs?: JobPin[];
  dispatch?: boolean;
  selectedJobId?: string | null;
  onSelectJob?: (jobId: string) => void;
};

export function MapCanvas({ trips, jobs = emptyJobs, dispatch = false, selectedJobId, onSelectJob }: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const framed = useRef("");
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(false);

  const selectJob = useEffectEvent((jobId: string) => onSelectJob?.(jobId));
  const highlightPin = useEffectEvent(() => {
    const current = map.current;
    if (current?.getLayer(selectedPinLayer)) {
      current.setFilter(selectedPinLayer, ["==", ["get", "jobId"], selectedJobId ?? ""]);
    }
  });

  function selectBasemap(useSatellite: boolean) {
    const current = map.current;
    if (!current || satellite === useSatellite) return;
    if (!current.getSource(satelliteId)) {
      current.addSource(satelliteId, satelliteImage);
      current.addLayer({ id: satelliteId, type: "raster", source: satelliteId,
        paint: { "raster-fade-duration": 0 } }, "arrival-zones");
    }
    current.setLayoutProperty(satelliteId, "visibility", useSatellite ? "visible" : "none");
    setSatellite(useSatellite);
  }

  const draw = useEffectEvent(() => {
    const current = map.current;
    if (!current) return;
    const source = current.getSource<GeoJSONSource>(sourceId);
    if (!source) return;
    source.setData(mapData(trips, jobs));
    const signature = [...jobs, ...trips].map(({ jobId }) => jobId).join(",");
    if (signature === framed.current || !signature) return;
    framed.current = signature;
    const bounds = new LngLatBounds();
    for (const { position, destination } of trips) {
      bounds.extend(asPoint(position));
      if (destination) bounds.extend(asPoint(destination));
    }
    for (const { position } of jobs) bounds.extend(asPoint(position));
    current.fitBounds(bounds, { padding: 44, maxZoom: 15, duration: 0 });
  });

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let current: Map | undefined;
    try {
      registerTiles();
      current = new Map({
        container: host,
        style: regionalStyle(window.location.origin),
        center: metroManilaCenter,
        zoom: 13,
        scrollZoom: false,
        dragRotate: false,
      });
      map.current = current;
      current.addControl(new NavigationControl({ showCompass: false }));
      current.on("load", () => {
        if (!current) return;
        current.addSource(sourceId, { type: "geojson", data: mapData([], []) });
        current.addLayer({
          id: "arrival-zones", type: "fill", source: sourceId, filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#171717", "fill-opacity": 0.08, "fill-outline-color": "#525252" },
        });
        current.addLayer({
          id: "road-route-casing", type: "line", source: sourceId, filter: ["==", ["geometry-type"], "LineString"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ffffff", "line-width": 6 },
        });
        current.addLayer({
          id: "road-route", type: "line", source: sourceId, filter: ["==", ["geometry-type"], "LineString"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#c2410c", "line-width": 4 },
        });
        current.addLayer({
          id: pointsLayer, type: "circle", source: sourceId, filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-color": ["match", ["get", "kind"], "van", "#171717", "SCHEDULED", "#262626",
            "UNASSIGNED", "#fbbf24", "EN_ROUTE", "#c2410c", ["ARRIVED", "destination"], "#166534", "#525252"],
            "circle-radius": ["match", ["get", "kind"], "van", 8, 6], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
        });
        if (dispatch) {
          current.addLayer({
            id: selectedPinLayer, type: "circle", source: sourceId,
            paint: { "circle-color": "#ffffff", "circle-radius": 10, "circle-stroke-color": "#c2410c", "circle-stroke-width": 3 },
          }, pointsLayer);
          highlightPin();
          const canvas = current.getCanvas();
          current.on("click", pointsLayer, ({ features }) => {
            const jobId = pinJobId(features);
            if (jobId) selectJob(jobId);
          });
          current.on("mousemove", pointsLayer, ({ features }) => {
            canvas.style.cursor = pinJobId(features) ? "pointer" : "";
          });
          current.on("mouseleave", pointsLayer, () => { canvas.style.cursor = ""; });
        }
        draw();
        setReady(true);
      });
    } catch {
      requestAnimationFrame(() => setUnavailable(true));
    }
    return () => {
      current?.remove();
      map.current = null;
      framed.current = "";
    };
  }, [dispatch]);

  useEffect(() => { draw(); }, [trips, jobs]);
  useEffect(() => { highlightPin(); }, [selectedJobId]);

  return (
    <div className="space-y-2">
      <div className="relative" hidden={unavailable}>
        <div ref={container} role="region" aria-label="Live location map" className="rl-map-frame overflow-hidden rounded-lg bg-neutral-50" />
        {dispatch && ready && (
          <div role="group" aria-label="Basemap" className="absolute top-2.5 left-2.5 flex overflow-hidden rounded-md border border-neutral-300 bg-white">
            {([false, true] as const).map((value) => (
              <button key={String(value)} type="button" aria-pressed={satellite === value} onClick={() => selectBasemap(value)}
                className="min-h-10 px-3 text-xs font-semibold focus-visible:-outline-offset-2 aria-pressed:bg-neutral-900 aria-pressed:text-white">
                {value ? "Satellite" : "Street"}
              </button>
            ))}
          </div>
        )}
      </div>
      {unavailable ? <p className="text-sm text-neutral-600">The location map is unavailable on this device.</p> : (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700">
          {trips.length > 0 && <span><span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-neutral-900" />Technician</span>}
          {jobs.length > 0 && <span>Job pins · 100 m arrival zones</span>}
          {satellite && <span>Contains modified Copernicus Sentinel data 2026</span>}
          {!jobs.length && trips.some(({ destination }) => destination) && (
            <span><span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-green-800" />Service destination</span>
          )}
        </p>
      )}
    </div>
  );
}
