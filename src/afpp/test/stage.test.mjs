import test from 'node:test';
import assert from 'node:assert/strict';
import { leafletZoom, globeZoom, leafletPxPerRad, globePxPerRad, MAP_ENTRY_ZOOM, MAP_MIN_ZOOM, GLOBE_FREE_MAX } from '../stage.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('globe ↔ Leaflet zoom round-trips at any latitude and size', () => {
  for (const lat of [0, 8.44, 46.85, -54.8, 70]) {
    for (const size of [{ w: 390, h: 420 }, { w: 768, h: 280 }, { w: 1280, h: 700 }]) {
      for (const z of [MAP_MIN_ZOOM, MAP_ENTRY_ZOOM, 17]) near(leafletZoom(globeZoom(z, lat, size), lat, size), z);
      for (const g of [1, GLOBE_FREE_MAX, 300]) near(globeZoom(leafletZoom(g, lat, size), lat, size), g, 1e-6);
    }
  }
});

test('the same scale on both sides of the handover', () => {
  const size = { w: 768, h: 280 };
  const g = globeZoom(MAP_ENTRY_ZOOM, 46.85, size);
  near(globePxPerRad(g, size), leafletPxPerRad(MAP_ENTRY_ZOOM, 46.85), 1e-6);
});

test('Mercator: the same ground needs a higher zoom near the equator than in the north', () => {
  const size = { w: 800, h: 600 };
  assert.ok(leafletZoom(100, 0, size) > leafletZoom(100, 60, size));
  near(leafletZoom(100, 0, size) - leafletZoom(100, 60, size), 1, 1e-9); // cos 60° = 1/2
});

test('the free globe is far above the street map: zooming in has to dive', () => {
  // at the globe's free limit the ground would be at a continental Leaflet zoom
  assert.ok(leafletZoom(GLOBE_FREE_MAX, 46.85, { w: 768, h: 280 }) < MAP_MIN_ZOOM - 4);
  assert.ok(MAP_MIN_ZOOM < MAP_ENTRY_ZOOM);
});
