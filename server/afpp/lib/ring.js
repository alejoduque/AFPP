/**
 * The shared rings: one mix for everyone, streamed through Icecast.
 *
 *   browsers ──POST /api/ring {op, id, x, y}──▶ Ring (state, SSE `ring`)
 *                                                  │
 *   DATA_DIR/audio/<derive>/<rec>.<ext> ─ffmpeg─▶ mono PCM ─┐
 *   …                                                       ├─ RingCast: gain + pan
 *   …                                                       ┘  (mixAt, as the rings)
 *                                                  │
 *                                     ffmpeg (mp3) ─▶ icecast://…/afpp-rings.mp3
 *                                                  │
 *   browsers ◀────────── GET /api/ring.mp3 (proxied, same origin) ◀──┘
 *
 * The positions mean what they mean in the browser's own rings (src/afpp/mix.mjs,
 * copied below and checked against it in test/ring.test.mjs): the closer to the
 * centre, the louder; left or right of it, panned. The state survives a restart
 * in DATA_DIR/ring.json. Everything is optional: without ICECAST_* the shared
 * ring still moves for everyone, only nothing is streamed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// ------------------------------------------------------------ the rings' geometry (= src/afpp/mix.mjs)
export const CENTER = 0.5;
export const SONAR_R = 0.39;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function mixAt(x, y) {
  const dx = (x - CENTER) / SONAR_R;
  const dy = (y - CENTER) / SONAR_R;
  const distance = Math.hypot(dx, dy);
  const inside = distance < 1;
  if (!inside) return { inside, distance, gain: 0, pan: 0 };
  return { inside, distance, gain: Math.cos((distance * Math.PI) / 2), pan: clamp(dx, -1, 1) };
}

export const MAX_SOURCES = 12;
const SRC_RE = /^([A-Za-z0-9][A-Za-z0-9_.-]{0,99})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,99})$/;

// ------------------------------------------------------------ state
export class Ring {
  /**
   * @param {object} o
   * @param {import('./store.js').Store} o.store
   * @param {(state: object) => void} [o.onChange]
   */
  constructor({ store, file, onChange = () => {} }) {
    this.store = store;
    this.file = file;
    this.onChange = onChange;
    /** @type {Map<string, {x:number, y:number, t:number}>} */
    this.sources = new Map();
    this.streaming = false;
    this.saveTimer = null;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const s of saved.sources || []) {
        if (this.resolve(s.id)) this.sources.set(s.id, { x: Number(s.x), y: Number(s.y), t: s.t || 0 });
      }
    } catch {
      // no ring yet
    }
  }

  /** "derive/rec" → the derive, recording and audio file, if it is shared and has audio. */
  resolve(id) {
    const m = SRC_RE.exec(String(id || ''));
    if (!m) return null;
    const d = this.store.get(m[1]);
    const r = d?.recordings.find((x) => x.id === m[2]);
    if (!r || !r.ext) return null;
    return { d, r, file: this.store.audioPath(d.id, r.id, r.ext) };
  }

  /** What every browser sees (no owners, no paths on disk). */
  state() {
    const sources = [];
    for (const [id, p] of this.sources) {
      const x = this.resolve(id);
      if (!x) continue;
      sources.push({
        id,
        x: p.x,
        y: p.y,
        name: x.r.name || x.r.tags?.[0] || '',
        alias: x.d.alias,
        lat: x.r.lat,
        lng: x.r.lng,
        audio: `audio/${x.d.id}/${x.r.id}.${x.r.ext}`,
      });
    }
    return { sources, streaming: this.streaming };
  }

  /** {op: add|move|remove|clear, id, x, y} → true if something changed; throws on bad input. */
  apply(msg) {
    const op = msg?.op;
    if (op === 'clear') {
      if (!this.sources.size) return false;
      this.sources.clear();
      return this.#changed();
    }
    const id = String(msg?.id || '');
    if (op === 'remove') return this.sources.delete(id) ? this.#changed() : false;
    if (op !== 'add' && op !== 'move') throw Object.assign(new Error('op must be add, move, remove or clear'), { status: 400 });
    if (!this.resolve(id)) throw Object.assign(new Error('not a shared sound with audio'), { status: 404 });
    const x = Number(msg.x);
    const y = Number(msg.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw Object.assign(new Error('x and y are required'), { status: 400 });
    if (!this.sources.has(id) && this.sources.size >= MAX_SOURCES) {
      throw Object.assign(new Error(`the shared rings hold ${MAX_SOURCES} sounds`), { status: 409 });
    }
    this.sources.set(id, { x: clamp(x, 0.03, 0.97), y: clamp(y, 0.03, 0.97), t: Date.now() });
    return this.#changed();
  }

  /** A derive was unshared (or a recording dropped): forget its sounds. */
  prune() {
    let n = 0;
    for (const id of [...this.sources.keys()]) if (!this.resolve(id) && this.sources.delete(id)) n++;
    if (n) this.#changed();
  }

  /** The mix as RingCast wants it: [{id, file, gain, pan}] for the sounds inside. */
  voices() {
    const out = [];
    for (const [id, p] of this.sources) {
      const x = this.resolve(id);
      const m = mixAt(p.x, p.y);
      if (x && m.inside) out.push({ id, file: x.file, gain: m.gain, pan: m.pan });
    }
    return out;
  }

  #changed() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const data = { sources: [...this.sources].map(([id, p]) => ({ id, ...p })) };
        fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(data));
        fs.renameSync(`${this.file}.tmp`, this.file);
      } catch (e) {
        console.error('ring: could not save', e.message);
      }
    }, 1000);
    this.saveTimer.unref?.();
    this.onChange(this.state());
    return true;
  }
}

// ------------------------------------------------------------ mixing
export const RATE = 44100;
const CHUNK_MS = 20;

/**
 * Add one mono voice into an interleaved stereo float buffer, ramping gain and
 * pan from (g0, p0) to (g1, p1) across the chunk so moves never click. Pan is
 * equal-power, as Web Audio's StereoPanner does for a mono input.
 */
export function addVoice(out, mono, g0, p0, g1, p1) {
  const n = mono.length;
  for (let i = 0; i < n; i++) {
    const k = n > 1 ? i / (n - 1) : 1;
    const g = g0 + (g1 - g0) * k;
    const a = (((p0 + (p1 - p0) * k) + 1) / 2) * (Math.PI / 2);
    const v = (mono[i] / 32768) * g;
    out[2 * i] += v * Math.cos(a);
    out[2 * i + 1] += v * Math.sin(a);
  }
}

/** Float stereo → s16le, with a soft knee so a crowded ring saturates instead of wrapping. */
export function toPcm16(out) {
  const buf = Buffer.alloc(out.length * 2);
  for (let i = 0; i < out.length; i++) {
    const v = out[i];
    const s = Math.abs(v) <= 0.8 ? v : Math.sign(v) * (0.8 + 0.2 * Math.tanh((Math.abs(v) - 0.8) / 0.2));
    buf.writeInt16LE(Math.round(clamp(s, -1, 1) * 32767), i * 2);
  }
  return buf;
}

/** One looping sound, decoded by ffmpeg to mono s16le, buffered about a second ahead. */
class Decoder {
  constructor(file, ffmpeg) {
    this.chunks = [];
    this.bytes = 0;
    this.dead = false;
    this.proc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-stream_loop', '-1', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(RATE), 'pipe:1'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    this.proc.on('error', () => (this.dead = true));
    this.proc.on('exit', () => (this.dead = true));
    this.rest = null; // half a sample left over from the last read
    this.proc.stdout.on('data', (b) => {
      if (this.rest) b = Buffer.concat([this.rest, b]);
      this.rest = b.length % 2 ? b.subarray(b.length - 1) : null;
      if (this.rest) b = b.subarray(0, b.length - 1);
      if (!b.length) return;
      this.chunks.push(b);
      this.bytes += b.length;
      if (this.bytes > RATE * 2) this.proc.stdout.pause(); // ~1 s ahead is plenty
    });
  }

  /** n samples (zeros where the decoder has not caught up). */
  take(n) {
    const out = new Int16Array(n);
    let filled = 0;
    while (filled < n && this.chunks.length) {
      const c = this.chunks[0];
      const avail = Math.floor(c.length / 2);
      const k = Math.min(avail, n - filled);
      for (let i = 0; i < k; i++) out[filled + i] = c.readInt16LE(i * 2);
      filled += k;
      if (k === avail) {
        this.chunks.shift();
        this.bytes -= c.length;
      } else {
        this.chunks[0] = c.subarray(k * 2);
        this.bytes -= k * 2;
      }
    }
    if (this.bytes < RATE) this.proc.stdout.resume();
    return out;
  }

  stop() {
    this.dead = true;
    this.proc.kill('SIGKILL');
  }
}

/**
 * The mixer: a 20 ms clock (kept to wall time, so the stream neither drifts
 * nor bunches) sums the voices and feeds one ffmpeg encoder that sends MP3 to
 * Icecast (or to a file, RING_OUT, for tests). It runs while the ring holds a
 * sound inside, and IDLE_MS of silence after, so a listener is not cut off
 * between two people's moves.
 */
export class RingCast {
  constructor({ ring, target, ffmpeg = 'ffmpeg', idleMs = 120_000, log = console, onStreaming = () => {} }) {
    this.ring = ring;
    this.target = target; // icecast://source:pw@host:port/mount, or a file path
    this.ffmpeg = ffmpeg;
    this.idleMs = idleMs;
    this.log = log;
    this.onStreaming = onStreaming;
    this.decoders = new Map(); // id → Decoder
    this.levels = new Map(); // id → {g, p} last applied
    this.enc = null;
    this.timer = null;
    this.silentSince = null;
    this.retryAt = 0;
  }

  /** Call when the ring changes. */
  update() {
    const voices = this.ring.voices();
    if (voices.length) this.silentSince = null;
    if (voices.length && !this.timer && Date.now() >= this.retryAt) this.#start();
    // decoders for new voices; drop the ones that left
    const ids = new Set(voices.map((v) => v.id));
    for (const [id, dec] of this.decoders) {
      if (!ids.has(id)) {
        dec.stop();
        this.decoders.delete(id);
        this.levels.delete(id);
      }
    }
    if (this.timer) for (const v of voices) if (!this.decoders.has(v.id)) this.decoders.set(v.id, new Decoder(v.file, this.ffmpeg));
  }

  #start() {
    const icecast = this.target.startsWith('icecast://');
    const args = ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(RATE), '-ac', '2', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '128k'];
    if (icecast) args.push('-content_type', 'audio/mpeg', '-ice_name', 'AFPP - rings', '-ice_description', 'The shared rings of the Alpine Feminist Punk Parade');
    args.push('-f', 'mp3', ...(icecast ? [] : ['-y']), this.target);
    const enc = spawn(this.ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    enc.stderr.on('data', (b) => (err = (err + b).slice(-500)));
    enc.stdin.on('error', () => {});
    enc.on('error', (e) => this.log.error('ring: encoder', e.message));
    enc.on('exit', (code) => {
      if (this.enc !== enc) return;
      this.log.error(`ring: encoder stopped (${code})${err ? `: ${err.trim()}` : ''}`);
      this.#stop();
      this.retryAt = Date.now() + 10_000; // e.g. Icecast restarting: try again on the next change after 10 s
    });
    this.enc = enc;
    this.t0 = process.hrtime.bigint();
    this.sent = 0;
    this.timer = setInterval(() => this.#tick(), CHUNK_MS);
    this.ring.streaming = true;
    this.onStreaming(true);
    for (const v of this.ring.voices()) if (!this.decoders.has(v.id)) this.decoders.set(v.id, new Decoder(v.file, this.ffmpeg));
  }

  #tick() {
    const due = Math.floor((Number(process.hrtime.bigint() - this.t0) / 1e9) * RATE);
    let n = due - this.sent;
    if (n <= 0) return;
    if (n > RATE) n = RATE; // after a stall, do not burst more than a second
    const voices = this.ring.voices();
    if (!voices.length) {
      this.silentSince ??= Date.now();
      if (Date.now() - this.silentSince > this.idleMs) return this.#stop();
    }
    const out = new Float32Array(n * 2);
    for (const v of voices) {
      const dec = this.decoders.get(v.id);
      if (!dec) continue;
      const last = this.levels.get(v.id) || { g: 0, p: v.pan };
      addVoice(out, dec.take(n), last.g, last.p, v.gain, v.pan);
      this.levels.set(v.id, { g: v.gain, p: v.pan });
    }
    this.sent += n;
    if (this.enc?.stdin.writable) this.enc.stdin.write(toPcm16(out));
  }

  #stop() {
    clearInterval(this.timer);
    this.timer = null;
    for (const dec of this.decoders.values()) dec.stop();
    this.decoders.clear();
    this.levels.clear();
    const enc = this.enc;
    this.enc = null;
    if (enc) {
      enc.stdin.end();
      setTimeout(() => enc.kill('SIGTERM'), 2000).unref?.();
    }
    this.ring.streaming = false;
    this.onStreaming(false);
  }

  stop() {
    this.#stop();
  }
}

/** ICECAST_URL + ICECAST_SOURCE_PASSWORD + ICECAST_MOUNT → icecast://… (or null). */
export function icecastTarget(env) {
  if (env.RING_OUT) return path.resolve(env.RING_OUT);
  if (!env.ICECAST_URL || !env.ICECAST_SOURCE_PASSWORD) return null;
  const u = new URL(env.ICECAST_URL);
  const mount = ringMount(env);
  return `icecast://${encodeURIComponent(env.ICECAST_SOURCE_USER || 'source')}:${encodeURIComponent(env.ICECAST_SOURCE_PASSWORD)}@${u.hostname}:${u.port || 8000}${mount}`;
}

export function ringMount(env) {
  const m = String(env.ICECAST_MOUNT || '/afpp-rings.mp3');
  return m.startsWith('/') ? m : `/${m}`;
}
