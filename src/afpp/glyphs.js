/**
 * Glyphs: the marks drawn on the maps, as swappable sets (see /kit/).
 *
 * Slots, each a 1-bit PNG in public/glyphs/<set>/:
 *   me      you, on the field map
 *   sound   a sound you (or the walker) recorded
 *   other   a sound someone else shared, near you
 *   crumb   the breadcrumbs dropped along a trace, every `crumbEvery` metres
 *
 * public/glyphs/glyphs.json names the active set; ?glyphs=<set> in the URL
 * previews another without changing anything for anyone else. A slot a set
 * leaves empty falls back to the plain squares (CSS classes), so a set can be
 * partial: Marino's gestures for `me`, Seraina's seeds for `crumb`, …
 */
import L from 'leaflet';

const BASE = `${import.meta.env.BASE_URL}glyphs/`;
let config = { active: 'squares', sets: {} };

/** Load once at start-up (main.jsx), before the maps draw. Never throws. */
export async function loadGlyphs() {
  try {
    const res = await fetch(`${BASE}glyphs.json`, { cache: 'no-cache' });
    if (res.ok) config = await res.json();
  } catch {
    // offline or missing: squares
  }
  try {
    const preview = new URLSearchParams(location.search).get('glyphs');
    if (preview && config.sets?.[preview]) config = { ...config, active: preview };
  } catch {
    // no location (tests)
  }
  return config;
}

const activeSet = () => config.sets?.[config.active] || {};

/** Stable small hash of a string, to pick a variant per sound. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A Leaflet icon for a slot, or the square fallback with `fallbackClass`.
 * A slot may hold one file, several (variants: picked by `key`, so the same
 * sound keeps its mark), or, for `me`, a sprite {sprite, frames, fps} that
 * animates in whole steps.
 */
export function glyphIcon(slot, fallbackClass, state = '', key = '') {
  const set = activeSet();
  const value = set[slot];
  if (!value || (Array.isArray(value) && !value.length)) {
    return L.divIcon({ className: `${fallbackClass} ${state}`.trim(), iconSize: [14, 14] });
  }
  const size = set.sizes?.[slot] || set.size || 32;
  const cls = `afpp-glyph afpp-glyph--${slot} ${state}`.trim();
  if (value.sprite) {
    const frames = value.frames || 1;
    const style = [
      `background-image:url(${BASE}${config.active}/${value.sprite})`,
      `--frames:${frames}`,
      `--size:${size}px`,
      `--dur:${frames / (value.fps || 2)}s`,
    ].join(';');
    return L.divIcon({ className: `${cls} afpp-glyph--sprite`, iconSize: [size, size], html: `<i style="${style}"></i>` });
  }
  const file = Array.isArray(value) ? value[(typeof key === 'number' ? key : hash(String(key))) % value.length] : value;
  return L.icon({
    iconUrl: `${BASE}${config.active}/${file}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, set.anchorBottom ? size : size / 2],
    className: cls,
  });
}

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function metres(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Points every `step` metres along a polyline of [lat, lng]. */
export function pointsAlong(latlngs, step) {
  const out = [];
  let carry = 0;
  for (let i = 1; i < latlngs.length; i++) {
    const a = latlngs[i - 1];
    const b = latlngs[i];
    const d = metres(a, b);
    let at = step - carry;
    while (at <= d) {
      const f = at / d;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      at += step;
    }
    carry = (carry + d) % step;
  }
  return out;
}

/**
 * Breadcrumbs along a trace, if the active set has a crumb; null otherwise.
 * Every `crumbEvery` metres, but never closer than `crumbSpacingPx` on screen,
 * so a zoomed-out trace stays a dotted line instead of a blob. Redrawn on zoom.
 */
export function crumbsLayer(latlngs, map) {
  const set = activeSet();
  if (!set.crumb || !map || latlngs.length < 2) return null;
  const g = L.layerGroup();
  const draw = () => {
    g.clearLayers();
    const metresPerPx = (40075016.686 * Math.cos(rad(latlngs[0][0]))) / 2 ** (map.getZoom() + 8);
    const step = Math.max(set.crumbEvery || 25, metresPerPx * (set.crumbSpacingPx || 36));
    // Variants in turn: left foot, right foot, a seed, …
    pointsAlong(latlngs, step).forEach((p, i) => {
      L.marker(p, { icon: glyphIcon('crumb', '', '', i), interactive: false, keyboard: false }).addTo(g);
    });
  };
  g.on('add', () => {
    draw();
    map.on('zoomend', draw);
  });
  g.on('remove', () => map.off('zoomend', draw));
  return g;
}

export const glyphSetName = () => config.active;
