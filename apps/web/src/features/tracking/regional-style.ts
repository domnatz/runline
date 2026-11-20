import type { ImageSourceSpecification, StyleSpecification } from "maplibre-gl";

export const metroManilaCenter: [number, number] = [121.028, 14.560];
const bounds: [number, number, number, number] = [120.98, 14.505, 121.095, 14.61];
const region = "metro-manila";

export const satelliteImage: ImageSourceSpecification = {
  type: "image",
  url: "/maps/metro-manila-satellite.webp",
  coordinates: [[120.945, 14.655], [121.14, 14.655], [121.14, 14.47], [120.945, 14.47]],
};

export function regionalStyle(origin: string): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origin}/maps/fonts/{fontstack}/{range}.pbf`,
    sources: {
      [region]: {
        type: "vector", url: `pmtiles://${origin}/maps/metro-manila.pmtiles`, bounds, minzoom: 10, maxzoom: 15,
        attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#f5f5f5" } },
      { id: "parks", type: "fill", source: region, "source-layer": "landuse",
        filter: ["in", ["get", "kind"], ["literal", ["park", "grass", "forest", "golf_course", "garden", "pitch"]]],
        paint: { "fill-color": "#e8e8e8" } },
      { id: "water", type: "fill", source: region, "source-layer": "water",
        paint: { "fill-color": "#d4d4d4" } },
      { id: "waterways", type: "line", source: region, "source-layer": "water",
        paint: { "line-color": "#d4d4d4", "line-width": 1.3 } },
      { id: "buildings", type: "fill", source: region, "source-layer": "buildings", minzoom: 14,
        paint: { "fill-color": "#dedede" } },
      { id: "roads", type: "line", source: region, "source-layer": "roads", minzoom: 10,
        filter: ["in", ["get", "kind"], ["literal", ["highway", "major_road", "medium_road", "minor_road", "other"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["match", ["get", "kind"], "highway", "#a3a3a3", "major_road", "#c7c7c7", "#ffffff"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 14, 2.3, 18, 7] } },
      { id: "road-names", type: "symbol", source: region, "source-layer": "roads", minzoom: 14,
        filter: ["has", "name"],
        layout: { "symbol-placement": "line", "text-font": ["Noto Sans Regular"], "text-size": 10, "text-field": ["get", "name"] },
        paint: { "text-color": "#525252", "text-halo-color": "#ffffff", "text-halo-width": 1.2 } },
      { id: "place-names", type: "symbol", source: region, "source-layer": "places",
        filter: ["has", "name"],
        layout: { "text-font": ["Noto Sans Regular"], "text-size": 13, "text-field": ["get", "name"], "text-letter-spacing": 0.06 },
        paint: { "text-color": "#404040", "text-halo-color": "#ffffff", "text-halo-width": 1.4 } },
    ],
  };
}
