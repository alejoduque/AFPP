/**
 * The stage: one place, two renderers. Zoomed out it is the planet (GlobeView,
 * an orthographic d3 globe dithered to 1-bit); zoomed in it is the street map
 * (WalkMap, Leaflet with OSM reduced to line art). The line art only reads at
 * street scale, so the planet takes over below MAP_MIN_ZOOM and the map is
 * entered at MAP_ENTRY_ZOOM. These functions keep the scale across the switch,
 * so a handover is a change of drawing, not a jump. Pure; test/stage.test.mjs.
 */

export const GLOBE_SCALE = 2; // CSS px per globe pixel (GlobeView's SCALE)
export const GLOBE_FREE_MAX = 6; // past this the planet dives into the map
export const MAP_ENTRY_ZOOM = 11; // the map opens here when zoomed into from the planet (city scale)
export const MAP_MIN_ZOOM = 8; // below this the line art turns into labels only: back to the planet
const TILE = 256;
const D2R = Math.PI / 180;
const cosLat = (lat) => Math.max(0.05, Math.cos(Math.max(-85, Math.min(85, lat)) * D2R));

/** Leaflet (Web Mercator): CSS px per radian of the ground at `lat`, zoom z. */
export const leafletPxPerRad = (z, lat) => (TILE * 2 ** z) / (2 * Math.PI * cosLat(lat));

/** GlobeView: CSS px per radian at its zoom, on a canvas of {w, h} CSS px. */
export const globePxPerRad = (zoom, { w, h }) => (Math.min(w, h) / GLOBE_SCALE / 2 - 6) * zoom * GLOBE_SCALE;

/** The Leaflet zoom that draws the ground at the same scale as the globe. */
export function leafletZoom(globeZoom, lat, size) {
  return Math.log2((globePxPerRad(globeZoom, size) * 2 * Math.PI * cosLat(lat)) / TILE);
}

/** The globe zoom that draws the ground at the same scale as Leaflet. */
export function globeZoom(lz, lat, size) {
  return leafletPxPerRad(lz, lat) / globePxPerRad(1, size);
}
