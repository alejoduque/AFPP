/**
 * AFPP store: shared derives on disk, one JSON file per derive plus its audio.
 *
 *   DATA_DIR/derives/<deriveId>.json
 *   DATA_DIR/audio/<deriveId>/<recordingId>.<ext>
 *
 * The whole index lives in memory (a few thousand derives is a few MB) and is
 * rebuilt from the JSON files at boot. No database.
 */

import fs from 'node:fs';
import path from 'node:path';

export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
export const AUDIO_TYPES = {
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'video/mp4': 'm4a', // Android's recorder labels AAC-in-MP4 as video/mp4
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};
export const EXT_TYPES = { m4a: 'audio/mp4', aac: 'audio/aac', webm: 'audio/webm', ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav' };

const MAX_CRUMBS = 5000;
const MAX_RECORDINGS = 200;

const round5 = (v) => Math.round(v * 1e5) / 1e5;
const isLat = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
const isLng = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const time = (v) => {
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Keep only what the public map needs, in a known shape. Throws on input that
 * cannot be a derive at all; silently drops individual bad points.
 */
export function sanitizeDerive(input) {
  if (!input || typeof input !== 'object') throw new Error('body must be a JSON object');
  const breadcrumbs = (Array.isArray(input.breadcrumbs) ? input.breadcrumbs : [])
    .filter((b) => b && isLat(b.lat) && isLng(b.lng))
    .slice(0, MAX_CRUMBS)
    .map((b) => ({ lat: round5(b.lat), lng: round5(b.lng), t: time(b.timestamp ?? b.t) }));
  const recordings = (Array.isArray(input.recordings) ? input.recordings : [])
    .filter((r) => r && ID_RE.test(String(r.id)) && isLat(r.lat) && isLng(r.lng))
    .slice(0, MAX_RECORDINGS)
    .map((r) => ({
      id: String(r.id),
      lat: round5(r.lat),
      lng: round5(r.lng),
      duration: Number.isFinite(r.duration) ? Math.max(0, r.duration) : 0,
      timestamp: time(r.timestamp),
      name: str(r.name, 120),
      notes: str(r.notes, 500),
      tags: (Array.isArray(r.tags) ? r.tags : []).map((t) => str(t, 40)).filter(Boolean).slice(0, 10),
    }));
  if (!breadcrumbs.length && !recordings.length) throw new Error('derive has no valid points');
  return {
    alias: str(input.alias, 40) || 'anon',
    title: str(input.title, 120),
    startTime: time(input.startTime),
    endTime: time(input.endTime),
    breadcrumbs,
    recordings,
  };
}

export function boundsOf(d) {
  const pts = [...d.breadcrumbs, ...d.recordings];
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of pts) {
    if (p.lng < w) w = p.lng;
    if (p.lng > e) e = p.lng;
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
  }
  return [w, s, e, n];
}

/** Does [w,s,e,n] a intersect b? (No antimeridian wrap; the map never asks for one.) */
export function intersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** One dot for the globe: where the derive is and how fresh. */
export function activityOf(d) {
  const [w, s, e, n] = d.bounds;
  return {
    id: d.id,
    alias: d.alias,
    title: d.title,
    lat: round5((s + n) / 2),
    lng: round5((w + e) / 2),
    lastAt: d.endTime || d.updatedAt || 0, // when it was walked; a fresh upload flashes via SSE instead
    n: d.recordings.filter((r) => r.ext).length,
  };
}

/** What anyone may see: never the owner's device id. */
export function publicView(d) {
  const { owner, ...rest } = d;
  return {
    ...rest,
    recordings: d.recordings.map((r) => ({ ...r, audio: r.ext ? `audio/${d.id}/${r.id}.${r.ext}` : null })),
  };
}

export class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.derivesDir = path.join(dataDir, 'derives');
    this.audioDir = path.join(dataDir, 'audio');
    fs.mkdirSync(this.derivesDir, { recursive: true });
    fs.mkdirSync(this.audioDir, { recursive: true });
    /** @type {Map<string, object>} */
    this.derives = new Map();
    for (const f of fs.readdirSync(this.derivesDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(this.derivesDir, f), 'utf8'));
        if (ID_RE.test(d.id)) this.derives.set(d.id, d);
      } catch (e) {
        console.error('skipping unreadable derive', f, e.message);
      }
    }
  }

  get(id) {
    return this.derives.get(id) || null;
  }

  #write(d) {
    const file = path.join(this.derivesDir, `${d.id}.json`);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(d));
    fs.renameSync(`${file}.tmp`, file);
  }

  /** Create or replace a derive. Audio already uploaded for kept recordings stays. */
  put(id, owner, input) {
    const clean = sanitizeDerive(input);
    const prev = this.derives.get(id);
    const prevExt = new Map((prev?.recordings || []).map((r) => [r.id, r.ext]));
    clean.recordings.forEach((r) => {
      if (prevExt.get(r.id)) r.ext = prevExt.get(r.id);
    });
    const d = { id, owner, ...clean, createdAt: prev?.createdAt || Date.now(), updatedAt: Date.now() };
    d.bounds = boundsOf(d);
    this.#write(d);
    this.derives.set(id, d);
    return d;
  }

  audioPath(id, rid, ext) {
    return path.join(this.audioDir, id, `${rid}.${ext}`);
  }

  /** Called once the audio file is fully on disk at tmpFile. */
  attachAudio(id, rid, ext, tmpFile) {
    const d = this.derives.get(id);
    const rec = d?.recordings.find((r) => r.id === rid);
    if (!rec) throw new Error('unknown recording');
    fs.mkdirSync(path.join(this.audioDir, id), { recursive: true });
    if (rec.ext && rec.ext !== ext) fs.rmSync(this.audioPath(id, rid, rec.ext), { force: true });
    fs.renameSync(tmpFile, this.audioPath(id, rid, ext));
    rec.ext = ext;
    d.updatedAt = Date.now();
    this.#write(d);
    return d;
  }

  remove(id) {
    this.derives.delete(id);
    fs.rmSync(path.join(this.derivesDir, `${id}.json`), { force: true });
    fs.rmSync(path.join(this.audioDir, id), { recursive: true, force: true });
  }

  activity() {
    return [...this.derives.values()].map(activityOf);
  }

  inBbox(bbox, limit = 200) {
    return [...this.derives.values()]
      .filter((d) => intersects(d.bounds, bbox))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }
}
