/**
 * The globe: line-art Earth, 1-bit, with a blinking dot wherever someone has
 * shared a derive.
 *
 * Drawn with d3-geo (orthographic) on a canvas at half resolution, then
 * quantised to the three tones — ground, ink, lit — with the same 4×4 Bayer
 * dither the rings use. To keep that cheap, ink is drawn into the red channel
 * and light into the green one; the quantiser reads each channel as coverage.
 *
 * Drag spins it; it drifts slowly when left alone. Clicking a dot turns the
 * globe to it and hands it to the street map.
 *
 * The tracklog: when people share their derives (or walk one live), the planet
 * turns into a tracklog. It flies down to the walk; as it leans in, the
 * continents dissolve in the dither and a local grid takes their place, the
 * planet's skin become the tracklog's paper. Then the walk is played in time
 * (tracklog.mjs squeezes it into 12–30 s): the path walked so far in ink, its
 * last steps lit, the walker a blinking square, each sound a ring that lights
 * up when the walker reaches it. A live walk is followed as it happens. When
 * the queue is done, the globe flies back out.
 *
 * The planet and the street map are one stage (stage.mjs): zooming in past
 * GLOBE_FREE_MAX dives down to the street map's scale (the same dissolve as
 * the tracklog) and hands over with onZoomIn; arriving from the map (`from`),
 * the globe starts at the map's scale and flies back out. Pinch works too.
 */
import React, { useEffect, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule, geoGraticule10, geoDistance, geoInterpolate } from 'd3-geo';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';
import { dither } from './sonar.js';
import { GROUND_RGB, INK_RGB, LIT_RGB } from './palette.js';
import { t } from '../i18n';
import { soundsLabel } from './format.js';
import { fitView, timeline, at, niceStep, hhmm, MAX_ZOOM } from './tracklog.mjs';
import { GLOBE_FREE_MAX, MAP_ENTRY_ZOOM, globeZoom } from './stage.mjs';

const SCALE = 2; // CSS px per globe pixel
const LAND = feature(land110, land110.objects.land);
const GRATICULE = geoGraticule10();
const HOUR = 3_600_000;
const FRESH_MS = HOUR; // a derive this recent shines white
const FLASH_MS = 30_000; // so does one that just changed (SSE)
const DRIFT = 3.6; // degrees per second when idle: one turn in about 100 s
const D2R = Math.PI / 180;
// the tracklog
const FLY_MS = 2600; // down to a walk, or from one walk to the next
const OUT_MS = 2000; // back out to the planet
const HOLD_MS = 2500; // a finished walk stays a moment before the next
const LIT_TRAIL_MS = 1500; // the last 1.5 s of playback are lit
const RING_MS = 1500; // a reached sound's ring swells this long
const DISSOLVE = Math.log(40); // the planet is gone by zoom 40
const DIVE_MS = 1600; // from the free planet down to the street map, or back

/** Blink period by age: recent derives blink fast, old ones breathe. */
function period(ageMs) {
  if (ageMs < HOUR) return 0.7;
  if (ageMs < 24 * HOUR) return 1.2;
  if (ageMs < 7 * 24 * HOUR) return 2.4;
  return 4.8;
}

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const line = (coords) => ({ type: 'LineString', coordinates: coords });

/**
 * A flight between two views, hopping out and back in when they are far apart
 * at street scale (a straight pan at zoom 20 000 would be a blur). In place
 * (diving into the street map, flying back out of it) it is one long zoom.
 * The clock starts at the first frame drawn (t0 null), so a slow mount does
 * not eat the animation.
 */
function flight(from, to, ms, done) {
  const dist = geoDistance(from.center, to.center);
  const interp = geoInterpolate(from.center, to.center);
  const l0 = Math.log(from.zoom);
  const l1 = Math.log(to.zoom);
  // a target already on screen (diving to the pointer) needs no hop: the centre
  // arrives early, while the zoom is still low, then the zoom carries on
  const near = dist * Math.min(from.zoom, to.zoom) <= 1;
  const lm = Math.log(Math.max(1, Math.min(from.zoom, to.zoom, dist > 0 ? 1 / dist : Infinity)));
  return {
    t0: null,
    ms,
    done,
    at(e) {
      if (near) return { center: interp(1 - Math.pow(1 - e, 3)), zoom: Math.exp(l0 + (l1 - l0) * ease(e)) };
      const z = e < 0.5 ? l0 + (lm - l0) * ease(e * 2) : lm + (l1 - lm) * ease((e - 0.5) * 2);
      return { center: interp(ease(e)), zoom: Math.exp(z) };
    },
  };
}

export default function GlobeView({ activity, flashes, focus, from, onSelect, onZoomIn, tracks = [], tracklog = false, onTracklog, onSound, listen = false, onListen }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const markRef = useRef(null);
  const trackRef = useRef(null); // the overlay strip: the walk is framed above it
  const state = useRef({
    rotate: from ? [-from.lng, -from.lat] : focus ? [-focus.lng, -focus.lat] : [75, -10],
    zoom: 1,
    from, // seen once, at mount: the map's place and scale, to fly out from
    pointers: new Map(), // fingers on the canvas (pinch)
    dragging: null,
    idleSince: 0,
    flight: null,
    activity,
    flashes,
    track: null, // the walk on screen: {trace, phase: in|play|hold|out, t0, tl, fired}
    played: new Set(),
  });
  const [hover, setHover] = useState(null);
  const [current, setCurrent] = useState(null); // the trace the overlay names
  const [reached, setReached] = useState(null); // the sound just reached: {name, x, y}
  const s0 = state.current;
  s0.activity = activity;
  s0.flashes = flashes;
  s0.tracks = tracks;
  s0.tracklog = tracklog && tracks.length > 0;
  s0.onTracklog = onTracklog;
  s0.onSound = onSound;
  s0.onSelect = onSelect;
  s0.onZoomIn = onZoomIn;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const projection = geoOrthographic().clipAngle(90).precision(0.6);
    const path = geoPath(projection, ctx);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let size = { w: 0, h: 0 };
    let img = null;
    let frame = 0;
    let reachedTimer = null;

    function resize() {
      const w = Math.max(80, Math.round(canvas.clientWidth / SCALE));
      const h = Math.max(80, Math.round(canvas.clientHeight / SCALE));
      if (w === size.w && h === size.h) return;
      size = { w, h };
      canvas.width = w;
      canvas.height = h;
      img = ctx.createImageData(w, h);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    function radius() {
      return (Math.min(size.w, size.h) / 2 - 6) * state.current.zoom;
    }

    // In the tracklog, the walk is framed in the canvas above the overlay strip.
    function trackFrame() {
      const strip = trackRef.current;
      const inset = strip ? Math.min(size.h / 2, (strip.offsetHeight + 16) / SCALE) : 0;
      return { w: size.w, h: size.h - inset, inset, base: Math.min(size.w, size.h) / 2 - 6 };
    }

    const view = () => ({ center: [-state.current.rotate[0], -state.current.rotate[1]], zoom: state.current.zoom });
    const setView = (v) => {
      state.current.rotate = [-v.center[0], -v.center[1]];
      state.current.zoom = v.zoom;
    };

    // ------------------------------------------------------------ tracklog
    function begin(trace, now) {
      const s = state.current;
      const target = fitView(trace, trackFrame());
      s.played.add(trace.id);
      if (!target) return next(now);
      s.track = { trace, phase: 'in', t0: now, tl: timeline(trace), fired: new Map(), target };
      setCurrent(trace);
      if (reduced) {
        setView(target);
        s.track.phase = 'play';
        return;
      }
      s.flight = flight(view(), target, FLY_MS, () => {
        if (s.track && s.track.trace.id === trace.id) {
          s.track.phase = 'play';
          s.track.t0 = performance.now();
        }
      });
    }

    function next(now) {
      const s = state.current;
      const upcoming = s.tracklog && s.tracks.find((tr) => !s.played.has(tr.id));
      if (upcoming) return begin(upcoming, now);
      out();
      s.onTracklog?.(false);
    }

    function out() {
      const s = state.current;
      s.track = null;
      s.played = new Set();
      setCurrent(null);
      setReached(null);
      const v = view();
      if (reduced) return setView({ center: v.center, zoom: 1 });
      s.flight = flight(v, { center: v.center, zoom: 1 }, OUT_MS, () => {});
    }

    /** Where the playhead is, in the walk's own time. */
    function playhead(tk, now) {
      const { trace, tl } = tk;
      if (trace.live) return Math.max(tl.t1, trace.crumbs.length ? trace.crumbs[trace.crumbs.length - 1].t : tl.t1);
      if (tk.phase === 'in') return tl.t0;
      if (tk.phase !== 'play' || reduced) return tl.t1;
      return Math.min(tl.t1, tl.t0 + (now - tk.t0) * tl.speed);
    }

    function stepTracklog(now) {
      const s = state.current;
      if (!s.tracklog) {
        if (s.track) out();
        return;
      }
      if (!s.track) {
        if (!s.flight) next(now);
        return;
      }
      const tk = s.track;
      const fresh = s.tracks.find((tr) => tr.id === tk.trace.id);
      if (fresh && fresh !== tk.trace) {
        tk.trace = fresh;
        tk.tl = timeline(fresh);
        if (fresh.live) setCurrent(fresh);
      }
      if (tk.phase === 'play') {
        // a walk that is live right now takes over from a stored one
        const first = s.tracks[0];
        const interrupt = first && first.live && !tk.trace.live && !s.played.has(first.id);
        // a stored walk ends when played through; a live one when it ends or goes away
        const finished = !fresh || tk.trace.ended || (!tk.trace.live && playhead(tk, now) >= tk.tl.t1);
        if (interrupt || finished) {
          tk.phase = 'hold';
          tk.t0 = interrupt ? now - HOLD_MS : now;
        } else if (tk.trace.live && !s.dragging && now - s.idleSince > 5000 && !s.flight) {
          // follow the walker: ease towards the view that frames the walk so far,
          // by the time passed (half the way in ~0.4 s), not by frames
          const target = fitView(tk.trace, trackFrame());
          if (target) {
            const k = 1 - Math.exp(-s.dt / 600);
            const v = view();
            setView({
              center: [v.center[0] + (target.center[0] - v.center[0]) * k, v.center[1] + (target.center[1] - v.center[1]) * k],
              zoom: Math.exp(Math.log(v.zoom) + (Math.log(target.zoom) - Math.log(v.zoom)) * k),
            });
          }
        }
      } else if (tk.phase === 'hold' && now - tk.t0 > (reduced ? 4 * HOLD_MS : HOLD_MS)) {
        s.track = null;
        next(now);
      }
    }

    function drawTrack(now) {
      const tk = state.current.track;
      if (!tk || tk.trace.crumbs.length + tk.trace.sounds.length === 0) return;
      const { trace, tl } = tk;
      const tNow = playhead(tk, now);
      const head = at(trace, tNow);
      const coords = trace.crumbs.map((c) => [c.lng, c.lat]);

      // the way ahead, faint and dotted (only while it is still ahead)
      if (head && coords.length > 1 && tNow < tl.t1) {
        ctx.beginPath();
        path(line(coords));
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = 'rgba(255,0,0,0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (head) {
        const walked = coords.slice(0, head.i + 1).concat([[head.lng, head.lat]]);
        if (walked.length > 1) {
          ctx.beginPath();
          path(line(walked));
          ctx.strokeStyle = 'rgb(255,0,0)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        // the last steps, lit
        const since = tNow - (trace.live ? 60_000 : tl.speed * LIT_TRAIL_MS);
        const recent = trace.crumbs.filter((c, i) => i <= head.i && c.t >= since).map((c) => [c.lng, c.lat]).concat([[head.lng, head.lat]]);
        if (recent.length > 1) {
          ctx.beginPath();
          path(line(recent));
          ctx.strokeStyle = 'rgb(0,255,0)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // sounds: a dim point ahead, an ink ring once reached, swelling lit when just reached
      for (const snd of trace.sounds) {
        const p = projection([snd.lng, snd.lat]);
        if (!p) continue;
        const [x, y] = p;
        if (snd.t > tNow) {
          ctx.fillStyle = 'rgba(255,0,0,0.4)';
          ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
          continue;
        }
        if (!tk.fired.has(snd.id)) {
          tk.fired.set(snd.id, now);
          if (tk.phase === 'play' && (!trace.live || now - tk.t0 > 1000)) reach(trace, snd, x, y);
        }
        const age = now - tk.fired.get(snd.id);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgb(255,0,0)';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (age < RING_MS && !reduced) {
          const k = age / RING_MS;
          ctx.beginPath();
          ctx.arc(x, y, 3 + k * 12, 0, 2 * Math.PI);
          ctx.strokeStyle = `rgba(0,255,0,${1 - k})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = 'rgb(0,255,0)';
          ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 4, 4);
        }
      }

      // the walker: a square blinking in whole steps
      if (head) {
        const p = projection([head.lng, head.lat]);
        const on = reduced || Math.floor(now / 250) % 2 === 0;
        if (p && on) {
          ctx.fillStyle = 'rgb(0,255,0)';
          ctx.fillRect(Math.round(p[0] - 2.5), Math.round(p[1] - 2.5), 5, 5);
        }
      }

      // the strip's marker, straight in the DOM (no React render per frame)
      if (markRef.current) {
        const span = Math.max(1, tl.t1 - tl.t0);
        markRef.current.style.left = `${Math.max(0, Math.min(100, ((tNow - tl.t0) / span) * 100))}%`;
      }
    }

    function reach(trace, snd, x, y) {
      const r = canvas.getBoundingClientRect();
      setReached({ name: snd.name || '◍', x: (x / size.w) * r.width, y: (y / size.h) * r.height });
      clearTimeout(reachedTimer);
      reachedTimer = setTimeout(() => setReached(null), 3000);
      state.current.onSound?.(trace, snd);
    }

    // ------------------------------------------------------------ frame
    function draw(now) {
      const s = state.current;
      const { w, h } = size;

      s.dt = Math.min(500, now - (s.lastFrame || now)); // ms since the last frame
      s.lastFrame = now;
      stepTracklog(now);

      // A flight: to a selected dot, to a walk, between walks, back out.
      if (s.flight) {
        if (s.flight.t0 == null) s.flight.t0 = now;
        const k = Math.min(1, (now - s.flight.t0) / s.flight.ms);
        setView(s.flight.at(k));
        if (k === 1) {
          const done = s.flight.done;
          s.flight = null;
          done();
        }
      } else if (!s.track && !s.dragging && !s.inside && !reduced && now - s.idleSince > 2500) {
        s.rotate = [s.rotate[0] + (DRIFT * Math.min(100, s.dt)) / 1000, s.rotate[1]];
      }

      // How far the planet has turned into the tracklog: 0 = globe, 1 = paper.
      const dissolve = Math.max(0, Math.min(1, Math.log(Math.max(1, s.zoom)) / DISSOLVE));
      const globe = 1 - dissolve;

      // the tracklog's frame sits above its overlay strip; the globe stays centred
      projection.translate([w / 2, (h - trackFrame().inset * dissolve) / 2]).scale(radius()).rotate(s.rotate);

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.lineJoin = 'round';

      // Ink (red channel): sphere rim, graticule, coastlines, a sparse land stipple.
      if (globe > 0.02) {
        ctx.beginPath();
        path({ type: 'Sphere' });
        ctx.strokeStyle = `rgba(255,0,0,${globe})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        path(GRATICULE);
        ctx.strokeStyle = `rgba(255,0,0,${0.35 * globe})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();

        ctx.beginPath();
        path(LAND);
        ctx.fillStyle = `rgba(255,0,0,${0.09 * globe})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,0,0,${globe})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }

      // The tracklog's paper: a local grid, a round step, a few lines across.
      if (dissolve > 0.15) {
        const center = [-s.rotate[0], -s.rotate[1]];
        const spanDeg = Math.min(w, h) / radius() / D2R;
        const step = niceStep(spanDeg);
        const ext = Math.min(80, spanDeg * 1.5);
        const extLng = Math.min(179, ext / Math.max(0.2, Math.cos(center[1] * D2R)));
        const lat = (v) => Math.max(-89.9, Math.min(89.9, v));
        const grid = geoGraticule()
          .extent([[center[0] - extLng, lat(center[1] - ext)], [center[0] + extLng, lat(center[1] + ext)]])
          .step([step, step])
          .precision(step / 4);
        ctx.beginPath();
        path(grid());
        ctx.strokeStyle = `rgba(255,0,0,${0.3 * Math.min(1, (dissolve - 0.15) / 0.5)})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // Dots. Ink or light depending on freshness; blinking in whole steps.
      const t = now / 1000;
      const center = [-s.rotate[0], -s.rotate[1]];
      const nowMs = Date.now();
      const placed = [];
      const playing = s.track && s.track.trace.id;
      for (const d of s.activity) {
        if (d.id === playing) continue; // its walk is being drawn
        const p = [d.lng, d.lat];
        if (geoDistance(p, center) > Math.PI / 2 - 0.02) continue;
        const [x, y] = projection(p);
        if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
        const age = nowMs - (d.lastAt || 0);
        const flashing = (s.flashes.get(d.id) || 0) > nowMs - FLASH_MS;
        const lit = flashing || age < FRESH_MS;
        const per = flashing ? 0.4 : period(age);
        const phase = reduced ? 0 : ((t + (d.id.length % 7) * 0.37) / per) % 1;
        const on = phase < 0.6;
        const ch = lit ? 'rgb(0,255,0)' : 'rgb(255,0,0)';
        const r = 2.5 + Math.min(2, Math.log10(1 + (d.n || 0)));
        if (on) {
          ctx.fillStyle = ch;
          ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
        }
        // A dithered halo that swells while the dot is on.
        if (!reduced) {
          const halo = r + 2 + phase * 8;
          const g = ctx.createRadialGradient(x, y, r, x, y, halo);
          g.addColorStop(0, lit ? 'rgba(0,255,0,0.55)' : 'rgba(255,0,0,0.45)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - halo, y - halo, halo * 2, halo * 2);
        }
        placed.push({ d, x, y });
      }
      s.placed = placed;

      drawTrack(now);

      // Quantise to ground / ink / lit.
      const src = ctx.getImageData(0, 0, w, h).data;
      const out = img.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          const c = dither(x, y, src[o + 1] / 255) ? LIT_RGB : dither(x, y, src[o] / 255) ? INK_RGB : GROUND_RGB;
          out[o] = c[0];
          out[o + 1] = c[1];
          out[o + 2] = c[2];
          out[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    // From the street map: start at its scale (the planet dissolved), fly back out.
    if (state.current.from) {
      const f = state.current.from;
      const startZoom = globeZoom(f.zoom, f.lat, { w: canvas.clientWidth, h: canvas.clientHeight });
      state.current.from = null;
      if (!reduced && startZoom > 1) {
        state.current.zoom = startZoom;
        // hold still a while over the place you came from before drifting on
        state.current.flight = flight({ center: [f.lng, f.lat], zoom: startZoom }, { center: [f.lng, f.lat], zoom: 1 }, DIVE_MS, () => {
          state.current.idleSince = performance.now() + 8000;
        });
      }
    }

    // ------------------------------------------------------------ input
    const toCanvas = (e) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * size.w, ((e.clientY - r.top) / r.height) * size.h];
    };
    const hit = (e) => {
      const [x, y] = toCanvas(e);
      let best = null;
      let bestD = 12 / SCALE + 4;
      for (const p of state.current.placed || []) {
        const dd = Math.hypot(p.x - x, p.y - y);
        if (dd < bestD) {
          bestD = dd;
          best = p;
        }
      }
      return best;
    };

    /**
     * Zoom by a factor; past the free limit (outside the tracklog) the planet
     * dives into the map, towards `at` (canvas px: the pointer, the pinch) when
     * that is on the sphere, else towards the centre.
     */
    function zoomBy(factor, at) {
      const s = state.current;
      if (s.flight) return;
      const next = s.zoom * factor;
      if (!s.track && next > GLOBE_FREE_MAX && s.onZoomIn) return dive(at);
      const max = s.track ? MAX_ZOOM : GLOBE_FREE_MAX;
      // Zoom about the pointer: the place under it stays under it. Scaling about
      // the centre slid it away, so the dive landed wherever had drifted under
      // the pointer (or on the centre, once it had slid past the rim).
      const p = at && pointAt(at);
      s.zoom = Math.max(0.7, Math.min(max, next));
      s.idleSince = performance.now();
      for (let i = 0; p && i < 2; i++) {
        projection.scale(radius()).rotate(s.rotate);
        const q = projection.invert(at);
        if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) break;
        const dLng = ((p[0] - q[0] + 540) % 360) - 180; // the short way round the antimeridian
        s.rotate = [s.rotate[0] - dLng, Math.max(-85, Math.min(85, s.rotate[1] - (p[1] - q[1])))];
      }
    }
    /** The [lng, lat] under canvas px `at`, when that is on the visible sphere. */
    function pointAt(at) {
      projection.scale(radius()).rotate(state.current.rotate);
      const p = projection.invert(at);
      const center = [-state.current.rotate[0], -state.current.rotate[1]];
      return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && geoDistance(p, center) < Math.PI / 2 - 0.01 ? p : null;
    }
    function dive(at) {
      const s = state.current;
      const [lng, lat] = (at && pointAt(at)) || [-s.rotate[0], -s.rotate[1]];
      const done = () => s.onZoomIn?.({ lat, lng, zoom: MAP_ENTRY_ZOOM });
      setHover(null);
      if (reduced) return done();
      const target = globeZoom(MAP_ENTRY_ZOOM, lat, { w: canvas.clientWidth, h: canvas.clientHeight });
      s.flight = flight(view(), { center: [lng, lat], zoom: target }, DIVE_MS, done);
    }
    function pinch() {
      const pts = [...state.current.pointers.values()];
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }

    function down(e) {
      const s = state.current;
      if (s.flight) return;
      canvas.setPointerCapture(e.pointerId);
      s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (s.pointers.size === 2) {
        // two fingers: a pinch, not a drag
        s.dragging = null;
        s.pinch = pinch();
        return;
      }
      s.dragging = { x: e.clientX, y: e.clientY, r: s.rotate, moved: 0 };
    }
    function move(e) {
      const s = state.current;
      if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (s.pointers.size === 2 && s.pinch) {
        const d = pinch();
        const [a, b] = [...s.pointers.values()];
        const r = canvas.getBoundingClientRect();
        const mid = [(((a.x + b.x) / 2 - r.left) / r.width) * size.w, (((a.y + b.y) / 2 - r.top) / r.height) * size.h];
        if (d > 0) zoomBy(d / s.pinch, mid);
        s.pinch = d;
        return;
      }
      // Over the sphere, the globe holds still, so a dot can be read and caught.
      const [mx, my] = toCanvas(e);
      s.inside = Math.hypot(mx - size.w / 2, my - size.h / 2) < radius();
      if (s.dragging) {
        const k = 0.35 / s.zoom;
        const dx = e.clientX - s.dragging.x;
        const dy = e.clientY - s.dragging.y;
        s.dragging.moved = Math.max(s.dragging.moved, Math.hypot(dx, dy));
        s.rotate = [s.dragging.r[0] + dx * k, Math.max(-85, Math.min(85, s.dragging.r[1] - dy * k))];
        s.idleSince = performance.now();
      } else {
        const p = hit(e);
        const r = canvas.getBoundingClientRect();
        setHover(p ? { d: p.d, x: (p.x / size.w) * r.width, y: (p.y / size.h) * r.height } : null);
        canvas.style.cursor = p || s.track ? 'pointer' : 'grab';
      }
    }
    function up(e) {
      const s = state.current;
      s.pointers.delete(e.pointerId);
      if (s.pinch) {
        if (s.pointers.size < 2) s.pinch = null;
        s.dragging = null;
        s.idleSince = performance.now() + 6000;
        return;
      }
      const drag = s.dragging;
      s.dragging = null;
      // A finger leaves no hover behind: hold still a while longer after a touch.
      s.idleSince = performance.now() + (e.pointerType === 'touch' ? 6000 : 0);
      if (drag && drag.moved < 6) {
        const p = hit(e);
        if (p) fly(p.d);
        else if (s.track && !s.track.trace.live) {
          // the walk on screen: open it on the street map
          const tr = s.track.trace;
          const target = s.track.target;
          s.onSelect?.({ id: tr.id, alias: tr.alias, title: tr.title, lat: target.center[1], lng: target.center[0] });
        }
      }
    }
    function wheel(e) {
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY * 0.0015), toCanvas(e));
    }
    function fly(d) {
      const s = state.current;
      const from = [-s.rotate[0], -s.rotate[1]];
      const to = [d.lng, d.lat];
      setHover(null);
      if (reduced) return s.onSelect(d);
      const interp = geoInterpolate(from, to);
      const z0 = s.zoom;
      const z1 = Math.max(s.zoom, 3.5);
      // turn, then lean in, then hand over
      s.flight = {
        t0: performance.now(),
        ms: 900 + geoDistance(from, to) * 300,
        done: () => s.onSelect(d),
        at: (k) => ({ center: interp(ease(k)), zoom: z0 + (z1 - z0) * ease(k) }),
      };
    }
    function key(e) {
      if (e.key === 'Escape' && state.current.track) state.current.onTracklog?.(false);
    }
    state.current.fly = fly;

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    const leave = () => {
      state.current.inside = false;
      setHover(null);
    };
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(reachedTimer);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointerleave', leave);
      window.removeEventListener('keydown', key);
    };
    // The loop reads everything else (props, callbacks) from the ref.
  }, []);

  const sounds = activity.reduce((n, d) => n + (d.n || 0), 0);
  // the overlay follows the newest version of the walk on screen (a live one grows)
  const cur = current && (tracks.find((tr) => tr.id === current.id) || current);
  const tl = cur && timeline(cur);

  return (
    <div className="afpp-globe" ref={wrapRef}>
      <canvas ref={canvasRef} className="afpp-globe__canvas" aria-label={t(cur ? 'afpp.track.label' : 'afpp.globe.label')} />
      {hover && (
        <div className="afpp-tip" style={{ left: hover.x, top: hover.y }}>
          <b>{hover.d.alias}</b>
          {hover.d.title ? ` · ${hover.d.title}` : ''}
          <br />
          {soundsLabel(hover.d.n || 0)} · {ago(hover.d.lastAt)}
        </div>
      )}
      {reached && (
        <div className="afpp-tip afpp-tip--sound" style={{ left: reached.x, top: reached.y }}>
          ◍ {reached.name}
        </div>
      )}

      {cur ? (
        <div className="afpp-track" ref={trackRef}>
          <p className="afpp-track__who">
            <span className="is-lit">◍</span> <b>{cur.alias}</b>
            {cur.title ? ` · ${cur.title}` : ''} <span className="afpp-dim">· {soundsLabel(cur.sounds.length)}</span>
            {cur.live && <span className="afpp-track__live"> {t('afpp.track.live')}</span>}
          </p>
          <div className="afpp-track__bar">
            <span>{hhmm(tl.t0)}</span>
            <span className="afpp-track__line" aria-hidden="true">
              {cur.sounds.map((snd) => (
                <i key={snd.id} className="afpp-track__tick" style={{ left: `${((snd.t - tl.t0) / Math.max(1, tl.t1 - tl.t0)) * 100}%` }} />
              ))}
              <i ref={markRef} className="afpp-track__mark" />
            </span>
            <span>{cur.live ? t('afpp.track.now') : hhmm(tl.t1)}</span>
            {!cur.live && <span className="afpp-dim">×{Math.round(tl.speed)}</span>}
          </div>
          <div className="afpp-track__actions">
            <button type="button" className="afpp-btn" aria-pressed={listen} onClick={() => onListen?.(!listen)}>
              ♪ {t(listen ? 'afpp.track.listening' : 'afpp.track.listen')}
            </button>
            <button type="button" className="afpp-btn" onClick={() => onTracklog?.(false)}>
              ◯ {t('afpp.track.planet')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="afpp-globe__count">
            {activity.length
              ? t('afpp.globe.count', { derives: activity.length, sounds })
              : t('afpp.globe.empty')}
          </p>
          {onTracklog && (activity.length > 0 || tracks.length > 0) && (
            <button type="button" className="afpp-btn afpp-globe__play" onClick={() => onTracklog(true)}>
              ▶ {t('afpp.track.play')}
            </button>
          )}
        </>
      )}

      {/* The same dots, and the walks in the tracklog, as a list for keyboards and screen readers. */}
      <ul className="afpp-sr">
        {tracklog &&
          tracks.map((tr) => {
            const span = timeline(tr);
            return (
              <li key={tr.id}>
                {t('afpp.track.item', { alias: tr.alias, title: tr.title || '', sounds: soundsLabel(tr.sounds.length), from: hhmm(span.t0), to: tr.live ? t('afpp.track.now') : hhmm(span.t1) })}
              </li>
            );
          })}
        {activity.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => state.current.fly?.(d)}>
              {d.alias} {d.title} — {soundsLabel(d.n || 0)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ago(ms) {
  if (!ms) return '';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return t('afpp.ago.now');
  if (m < 60) return t('afpp.ago.min', { n: m });
  const h = Math.round(m / 60);
  if (h < 48) return t('afpp.ago.hour', { n: h });
  return t('afpp.ago.day', { n: Math.round(h / 24) });
}
