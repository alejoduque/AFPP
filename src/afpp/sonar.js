/**
 * The rings, drawn 1-bit — ported from iScream's Mestizaje sonar.
 *
 * Every pixel is ground (black), ink (purple) or light (white). "Opacity" is
 * ordered dithering against a 4×4 Bayer matrix, the way old 1-bit screens
 * faked grey. The canvas is drawn at 1/SCALE resolution and scaled up with
 * image-rendering: pixelated, so the pixels show.
 *
 * The reticle (rings, crosshair, sweep) is ink; the waves around a sound that
 * is in the mix are light, so what you hear is what is lit. The dots
 * themselves are DOM buttons laid over the canvas (see RingMixer.jsx).
 */

import { CENTER, SONAR_R } from './mix.mjs';
import { INK_RGB, LIT_RGB, GROUND_RGB } from './palette.js';

const SCALE = 2; // CSS pixels per sonar pixel: the pitch of the dither
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const TRAIL = 1.1; // radians of fading trail behind the sweep
const SWEEP_PERIOD = 6; // seconds per turn
const COLORS = [GROUND_RGB, INK_RGB, LIT_RGB];

/** 1 = on, 0 = off, for a pixel at (x, y) with the given coverage 0..1. */
export function dither(x, y, coverage) {
  return coverage > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0;
}

export class Sonar {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {() => Array<{x:number, y:number, level:number, inside:boolean}>} getDots
   */
  constructor(canvas, getDots) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getDots = getDots;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.size = 0;
    this.base = null;
    this.frame = null;
    this.t0 = performance.now();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  resize() {
    const css = this.canvas.clientWidth;
    const size = Math.max(60, Math.round(css / SCALE));
    if (size === this.size) return;
    this.size = size;
    this.canvas.width = size;
    this.canvas.height = size;
    this.img = this.ctx.createImageData(size, size);
    this.base = this.#drawReticle(size);
    const c = CENTER * size;
    this.dist = new Float32Array(size * size);
    this.angle = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        this.dist[i] = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        this.angle[i] = Math.atan2(y + 0.5 - c, x + 0.5 - c);
      }
    }
  }

  start() {
    const loop = (now) => {
      this.#draw((now - this.t0) / 1000);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
  }

  #drawReticle(n) {
    const px = new Uint8Array(n * n);
    const c = CENTER * n;
    const R = SONAR_R * n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - c;
        const dy = y + 0.5 - c;
        const d = Math.hypot(dx, dy);
        let cov = 0;
        if (d < R) cov = 0.12;
        if (Math.abs(d - R) < 0.9) cov = 1;
        for (let k = 1; k < 4; k++) if (Math.abs(d - (R * k) / 4) < 0.6) cov = Math.max(cov, 0.75);
        if (d < R && (Math.abs(dx) < 0.5 || Math.abs(dy) < 0.5) && ((x + y) & 1)) cov = Math.max(cov, 0.8);
        if (d > R + 2 && d < R + 6) {
          const a = Math.atan2(dy, dx);
          const step = Math.PI / 6;
          if (Math.abs(a - Math.round(a / step) * step) * d < 0.6) cov = 1;
        }
        px[y * n + x] = dither(x, y, cov);
      }
    }
    return px;
  }

  #draw(t) {
    const n = this.size;
    const { base, dist, angle } = this;
    const px = this.px && this.px.length === n * n ? this.px : (this.px = new Uint8Array(n * n));
    const R = SONAR_R * n;
    const sweep = this.reduced ? null : ((t / SWEEP_PERIOD) % 1) * 2 * Math.PI - Math.PI;

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        let ink = base[i];
        if (!ink && sweep !== null && dist[i] < R) {
          let behind = sweep - angle[i];
          if (behind < 0) behind += 2 * Math.PI;
          if (behind < TRAIL) ink = dither(x, y, 0.7 * (1 - behind / TRAIL));
        }
        px[i] = ink;
      }
    }

    // Waves around each dot. In the mix → light, louder → wider; parked → ink.
    for (const d of this.getDots()) {
      const dx0 = d.x * n;
      const dy0 = d.y * n;
      const reach = (d.inside ? 10 + d.level * 26 : 8) * (3 / SCALE);
      const speed = (d.inside ? 10 : 4) * (3 / SCALE);
      const strength = d.inside ? 0.6 + d.level * 0.4 : 0.4;
      const value = d.inside ? 2 : 1;
      const x0 = Math.max(0, Math.floor(dx0 - reach));
      const x1 = Math.min(n - 1, Math.ceil(dx0 + reach));
      const y0 = Math.max(0, Math.floor(dy0 - reach));
      const y1 = Math.min(n - 1, Math.ceil(dy0 + reach));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dd = Math.hypot(x + 0.5 - dx0, y + 0.5 - dy0);
          if (dd > reach || dd < 3) continue;
          const phase = this.reduced ? 0.5 : (t * speed - dd) / (5 * (3 / SCALE));
          const ring = 1 - Math.abs((phase - Math.floor(phase)) * 2 - 1);
          if (ring <= 0.6) continue;
          const cov = (0.35 + 0.65 * (1 - dd / reach)) * strength;
          if (dither(x, y, cov)) px[y * n + x] = value;
        }
      }
    }

    const data = this.img.data;
    for (let i = 0; i < px.length; i++) {
      const [r, g, b] = COLORS[px[i]];
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
