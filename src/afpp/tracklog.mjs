/**
 * The tracklog: what the globe becomes when people share their derives.
 * Pure functions, no canvas (GlobeView.jsx draws; test/tracklog.test.mjs).
 *
 * A trace, stored or live, has one shape:
 *   {id, alias, title, live, crumbs: [{lat, lng, t}], sounds: [{id, lat, lng, t, name, duration, audio}]}
 * A derive's real duration is played in TRACK_MIN_MS…TRACK_MAX_MS.
 */

export const TRACK_MIN_MS = 12_000;
export const TRACK_MAX_MS = 30_000;
export const MAX_ZOOM = 300_000;
const MIN_SPAN_RAD = 60 / 6_371_000; // frame at least ~60 m, even for one point
const D2R = Math.PI / 180;

/** Crumbs with usable, rising times; spread between start and end (or 2 s apart) when not. */
export function withTimes(crumbs, start = null, end = null) {
  const list = (crumbs || []).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  const timed = list.length && list.every((c, i) => Number.isFinite(c.t) && (i === 0 || c.t >= list[i - 1].t));
  if (timed) return list.map((c) => ({ lat: c.lat, lng: c.lng, t: c.t }));
  const t0 = Number.isFinite(start) ? start : 0;
  const step = Number.isFinite(start) && Number.isFinite(end) && end > start && list.length > 1 ? (end - start) / (list.length - 1) : 2000;
  return list.map((c, i) => ({ lat: c.lat, lng: c.lng, t: t0 + i * step }));
}

/** The time of the crumb nearest to a point: for sounds that came without one. */
function nearestTime(crumbs, p) {
  let best = null;
  let bestD = Infinity;
  for (const c of crumbs) {
    const d = (c.lat - p.lat) ** 2 + (c.lng - p.lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c.t;
    }
  }
  return best ?? 0;
}

/** A stored derive (GET /api/derives/:id) as a trace. */
export function toTrace(d) {
  const crumbs = withTimes(d.breadcrumbs, d.startTime, d.endTime);
  const sounds = (d.recordings || [])
    .map((r) => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      t: Number.isFinite(r.timestamp) ? r.timestamp : nearestTime(crumbs, r),
      name: r.name || '',
      duration: r.duration || 0,
      audio: r.audio || null,
    }))
    .sort((a, b) => a.t - b.t);
  return { id: d.id, alias: d.alias, title: d.title || '', live: false, crumbs, sounds };
}

/** [w, s, e, n] of a trace's crumbs and sounds. */
export function boundsOf(trace) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of [...trace.crumbs, ...trace.sounds]) {
    if (p.lng < w) w = p.lng;
    if (p.lng > e) e = p.lng;
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
  }
  return w > e ? null : [w, s, e, n];
}

/**
 * Where to look and how close, for GlobeView's orthographic projection, whose
 * scale is base × zoom (base = min(w, h) / 2 − 6 of the whole canvas, which
 * may be larger than the w × h the walk is framed in). Near the centre a small
 * angle a spans about scale × a pixels.
 */
export function fitView(trace, { w, h, base: baseIn }, fill = 0.7) {
  const b = boundsOf(trace);
  if (!b) return null;
  const [west, south, east, north] = b;
  const center = [(west + east) / 2, (south + north) / 2];
  const base = Math.max(1, baseIn ?? Math.min(w, h) / 2 - 6);
  const spanX = Math.max(MIN_SPAN_RAD, (east - west) * D2R * Math.cos(center[1] * D2R));
  const spanY = Math.max(MIN_SPAN_RAD, (north - south) * D2R);
  const zoom = Math.min((w * fill) / (spanX * base), (h * fill) / (spanY * base));
  return { center, zoom: Math.max(3.5, Math.min(MAX_ZOOM, zoom)) };
}

/** First and last moments, and how long the playback takes. */
export function timeline(trace) {
  const times = [...trace.crumbs.map((c) => c.t), ...trace.sounds.map((s) => s.t)].filter(Number.isFinite);
  if (!times.length) return { t0: 0, t1: 0, playMs: TRACK_MIN_MS, speed: 1 };
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const real = Math.max(1, t1 - t0);
  const playMs = Math.max(TRACK_MIN_MS, Math.min(TRACK_MAX_MS, real / 120));
  return { t0, t1, playMs, speed: real / playMs };
}

/** The walker's position at real time t, between two crumbs; i = the last crumb reached. */
export function at(trace, t) {
  const c = trace.crumbs;
  if (!c.length) return null;
  if (t <= c[0].t) return { lat: c[0].lat, lng: c[0].lng, i: 0 };
  if (t >= c[c.length - 1].t) return { lat: c[c.length - 1].lat, lng: c[c.length - 1].lng, i: c.length - 1 };
  let lo = 0;
  let hi = c.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = c[lo];
  const b = c[hi];
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k, i: lo };
}

/** The sounds the playhead has reached by real time t. */
export const soundsUntil = (trace, t) => trace.sounds.filter((s) => s.t <= t);

/**
 * The order the tracklog plays in: walks live right now first (latest news
 * first), then walks that just ended, then shared derives, newest first.
 * shared: [{trace, at}] in any order; live: Map sid → live trace.
 */
export function playOrder(shared, live) {
  const walking = [...live.values()].filter((t) => t.live).sort((a, b) => b.seenAt - a.seenAt);
  const ended = [...live.values()].filter((t) => !t.live).sort((a, b) => b.seenAt - a.seenAt);
  // A walk shared at its end comes back as a stored derive with its sid as id
  // (liveWalk.js): while it is walked the live one plays, after it the stored one.
  const stored = [...shared].sort((a, b) => b.at - a.at).map((s) => s.trace);
  const has = (list, id) => list.some((t) => (t.sid || t.id) === id);
  return [...walking, ...ended.filter((t) => !has(stored, t.sid)), ...stored.filter((s) => !has(walking, s.id))];
}

/** A round grid step (1, 2 or 5 × 10^k degrees) giving about `lines` lines across span. */
export function niceStep(spanDeg, lines = 6) {
  const raw = Math.max(1e-7, spanDeg / lines);
  const k = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / k;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * k;
}

/** "12:04" in local time. */
export function hhmm(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
