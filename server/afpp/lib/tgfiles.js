/**
 * The Telegram group's files on the map.
 *
 * Every photo, video, voice note, sound, video message, gif and document shared
 * in the bridged group is downloaded (the Bot API hands bots files up to 20 MB)
 * into DATA_DIR/telegram/files/, with a small record in DATA_DIR/telegram/items/,
 * and placed where its sender was when they shared it:
 *
 *   1. their live location, or a location they sent, within WINDOW of the file
 *   2. else GPS inside the file itself (a photo sent as a file keeps its EXIF;
 *      a phone video keeps an ISO 6709 ©xyz atom)
 *   3. else the bot asks them, once, to share their location: a location from
 *      them within WINDOW afterwards places everything of theirs still waiting
 *
 * Unplaced files are kept (and can be deleted with tools/afpp-admin.sh) but
 * never shown. On the map, each sender's files, in time order, are their
 * breadcrumbs. Who: the same name as in #AFPP (@username or a stable
 * pseudonym), never the Telegram id; the record keeps only an HMAC of it, to
 * match a later location to the right person.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { displayName } from './telegram.js';

export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FILE = 20 * 1024 * 1024; // the Bot API's getFile limit
const ITEM_RE = /^tg[0-9]{1,20}_[0-9]{1,12}$/;
const EXT_RE = /^[a-z0-9]{1,5}$/;

/** Shown inline (safe types only); anything else is sent as a download. */
export const INLINE_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  oga: 'audio/ogg', ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac',
  pdf: 'application/pdf',
};

const KINDS = [
  ['photo', 'photo'], ['video', 'video'], ['animation', 'video'], ['video_note', 'video'],
  ['voice', 'sound'], ['audio', 'sound'], ['document', 'file'],
];

/** A message's media → {kind, fileId, size, mime, name} (the largest photo size), or null. */
export function mediaOf(m) {
  if (!m) return null;
  for (const [key, kind] of KINDS) {
    let f = m[key];
    if (!f) continue;
    const area = (x) => (x.width || 0) * (x.height || 0);
    if (Array.isArray(f)) f = [...f].sort((a, b) => area(b) - area(a) || (b.file_size || 0) - (a.file_size || 0))[0];
    if (!f?.file_id) return null;
    let k = kind;
    const mime = f.mime_type || (key === 'photo' ? 'image/jpeg' : '');
    if (key === 'document') {
      if (/^image\//.test(mime)) k = 'photo';
      else if (/^video\//.test(mime)) k = 'video';
      else if (/^audio\//.test(mime)) k = 'sound';
    }
    return { kind: k, fileId: f.file_id, size: f.file_size || 0, mime, name: f.file_name || '' };
  }
  return null;
}

/** The extension to keep a file under. */
export function extFor(filePath, mime, kind) {
  const fromPath = String(filePath || '').split('.').pop().toLowerCase();
  if (filePath && fromPath && EXT_RE.test(fromPath) && fromPath !== String(filePath).toLowerCase()) return fromPath;
  const byMime = Object.entries(INLINE_TYPES).find(([, t]) => t === mime);
  if (byMime) return byMime[0];
  return { photo: 'jpg', video: 'mp4', sound: 'oga' }[kind] || 'bin';
}

/**
 * Where was this person at time t? From their recent points [{lat, lng, t, live}]:
 * the nearest in time within WINDOW_MS, a live location preferred over a sent one.
 */
export function placeFor(points, t, windowMs = WINDOW_MS) {
  let best = null;
  for (const p of points || []) {
    const dt = Math.abs(p.t - t);
    if (dt > windowMs) continue;
    const score = dt - (p.live ? windowMs : 0);
    if (!best || score < best.score) best = { score, p };
  }
  return best ? { lat: best.p.lat, lng: best.p.lng, how: best.p.live ? 'live' : 'location' } : null;
}

const okLat = (v) => Number.isFinite(v) && v >= -90 && v <= 90;
const okLng = (v) => Number.isFinite(v) && v >= -180 && v <= 180;
const round5 = (v) => Math.round(v * 1e5) / 1e5;

/** GPS from a JPEG's EXIF (APP1), or null. */
export function exifGps(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let o = 2;
  while (o + 4 <= buf.length && buf[o] === 0xff) {
    const marker = buf[o + 1];
    const len = buf.readUInt16BE(o + 2);
    if (marker === 0xe1 && buf.toString('latin1', o + 4, o + 10) === 'Exif\0\0') return tiffGps(buf.subarray(o + 10, o + 2 + len));
    if (marker === 0xda) break; // image data: no EXIF after this
    o += 2 + len;
  }
  return null;
}

function tiffGps(t) {
  try {
    const le = t.toString('latin1', 0, 2) === 'II';
    const u16 = (i) => (le ? t.readUInt16LE(i) : t.readUInt16BE(i));
    const u32 = (i) => (le ? t.readUInt32LE(i) : t.readUInt32BE(i));
    const entries = (ifd) => {
      const n = u16(ifd);
      const out = new Map();
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), at: e + 8 });
      }
      return out;
    };
    const gpsPtr = entries(u32(4)).get(0x8825);
    if (!gpsPtr) return null;
    const gps = entries(u32(gpsPtr.at));
    const ref = (tag) => {
      const e = gps.get(tag);
      return e ? String.fromCharCode(t[e.at]) : '';
    };
    const dms = (tag) => {
      const e = gps.get(tag);
      if (!e || e.type !== 5 || e.count < 3) return NaN;
      const off = u32(e.at);
      const r = (i) => u32(off + i * 8) / (u32(off + i * 8 + 4) || 1);
      return r(0) + r(1) / 60 + r(2) / 3600;
    };
    let lat = dms(2);
    let lng = dms(4);
    if (ref(1) === 'S') lat = -lat;
    if (ref(3) === 'W') lng = -lng;
    if (!okLat(lat) || !okLng(lng) || (lat === 0 && lng === 0)) return null;
    return { lat: round5(lat), lng: round5(lng) };
  } catch {
    return null;
  }
}

/** GPS from a phone video's ©xyz atom ("+08.4388-075.5865/"), or null. */
export function mp4Gps(buf) {
  if (!Buffer.isBuffer(buf)) return null;
  const i = buf.indexOf(Buffer.from([0xa9, 0x78, 0x79, 0x7a]));
  if (i < 0) return null;
  const m = /([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)/.exec(buf.toString('latin1', i + 4, i + 64));
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return okLat(lat) && okLng(lng) && !(lat === 0 && lng === 0) ? { lat: round5(lat), lng: round5(lng) } : null;
}

/** What anyone may see of an item. */
export function publicItem(it) {
  const { who, ...rest } = it;
  return { ...rest, file: it.ext ? `telegram/file/${it.id}.${it.ext}` : null };
}

export class TgFiles {
  /**
   * @param {object} o
   * @param {string} o.dir      DATA_DIR/telegram
   * @param {string} o.secret   for the pseudonyms and the who-hash (the bot token)
   * @param {(item: object) => void} [o.onItem]   an item was placed
   */
  constructor({ dir, secret, onItem = () => {}, log = console, now = () => Date.now() }) {
    this.dir = dir;
    this.secret = String(secret || '');
    this.onItem = onItem;
    this.log = log;
    this.now = now;
    this.filesDir = path.join(dir, 'files');
    this.itemsDir = path.join(dir, 'items');
    fs.mkdirSync(this.filesDir, { recursive: true });
    fs.mkdirSync(this.itemsDir, { recursive: true });
    /** @type {Map<string, object>} */
    this.items = new Map();
    for (const f of fs.readdirSync(this.itemsDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const it = JSON.parse(fs.readFileSync(path.join(this.itemsDir, f), 'utf8'));
        if (ITEM_RE.test(it.id)) this.items.set(it.id, it);
      } catch {
        // a torn record: skip it
      }
    }
    /** @type {Map<string, Array<{lat, lng, t, live}>>} who → recent points */
    this.points = new Map();
    this.asked = new Map(); // who → when the bot last asked them
    this.locFile = path.join(dir, 'locations.jsonl');
    try {
      const since = this.now() - 2 * WINDOW_MS;
      for (const line of fs.readFileSync(this.locFile, 'utf8').split('\n')) {
        if (!line) continue;
        const p = JSON.parse(line);
        if (p.t >= since) this.#remember(p.who, p);
      }
    } catch {
      // none yet
    }
  }

  who(from) {
    return crypto.createHmac('sha256', `who:${this.secret}`).update(String(from?.id ?? '')).digest('hex').slice(0, 16);
  }

  #remember(who, p) {
    const list = (this.points.get(who) || []).filter((x) => x.t >= this.now() - 2 * WINDOW_MS);
    list.push({ lat: p.lat, lng: p.lng, t: p.t, live: !!p.live });
    this.points.set(who, list.slice(-200));
  }

  #save(it) {
    const file = path.join(this.itemsDir, `${it.id}.json`);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(it));
    fs.renameSync(`${file}.tmp`, file);
    this.items.set(it.id, it);
  }

  /**
   * A location message, or a live-location update (edited_message). Places
   * whatever of theirs is still waiting within WINDOW_MS. Returns placed items.
   */
  location(message, { edited = false } = {}) {
    const loc = message?.location;
    if (!loc || !okLat(loc.latitude) || !okLng(loc.longitude)) return [];
    const who = this.who(message.from);
    const t = ((edited && message.edit_date) || message.date || this.now() / 1000) * 1000;
    const p = { who, lat: round5(loc.latitude), lng: round5(loc.longitude), t, live: !!(loc.live_period || edited) };
    this.#remember(who, p);
    try {
      fs.appendFileSync(this.locFile, `${JSON.stringify(p)}\n`);
    } catch (e) {
      this.log.error('telegram: could not keep a location', e.message);
    }
    const placed = [];
    for (const it of this.items.values()) {
      if (it.who !== who || it.lat != null || Math.abs(it.t - t) > WINDOW_MS) continue;
      Object.assign(it, { lat: p.lat, lng: p.lng, how: p.live ? 'live' : 'location' });
      this.#save(it);
      placed.push(it);
      this.onItem(publicItem(it));
    }
    return placed;
  }

  /**
   * A message with media: download it (with getFile + the file URL), place it,
   * keep it. Returns {item, ask}: ask = true when the bot should ask for a location.
   * @param {(method: string, body: object) => Promise<any>} call   the Bot API
   * @param {string} fileBase   e.g. https://api.telegram.org/file/bot<token>
   */
  async media(message, call, fileBase) {
    const media = mediaOf(message);
    if (!media) return null;
    const id = `tg${Math.abs(Number(message.chat?.id) || 0)}_${Number(message.message_id) || 0}`;
    if (!ITEM_RE.test(id) || this.items.has(id)) return null;
    const who = this.who(message.from);
    const t = (message.date || this.now() / 1000) * 1000;
    const it = {
      id,
      who,
      name: displayName(message.from, this.secret),
      kind: media.kind,
      mime: media.mime,
      filename: media.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120),
      caption: String(message.caption || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 1000),
      t,
      lat: null,
      lng: null,
      how: null,
      ext: null,
      size: media.size,
    };
    if (!media.size || media.size <= MAX_FILE) {
      try {
        const f = await call('getFile', { file_id: media.fileId });
        const ext = extFor(f.file_path, media.mime, media.kind);
        const dest = path.join(this.filesDir, `${id}.${ext}`);
        const res = await fetch(`${fileBase}/${f.file_path}`);
        if (!res.ok || !res.body) throw new Error(`download: HTTP ${res.status}`);
        await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(`${dest}.tmp`));
        fs.renameSync(`${dest}.tmp`, dest);
        it.ext = ext;
        it.size = fs.statSync(dest).size;
      } catch (e) {
        this.log.error('telegram: could not fetch a file', e.message);
      }
    }
    let place = placeFor(this.points.get(who), t);
    if (!place && it.ext) {
      const head = this.#head(id, it.ext);
      const gps = it.kind === 'video' ? mp4Gps(head) : exifGps(head);
      if (gps) place = { ...gps, how: 'file' };
    }
    if (place) Object.assign(it, place);
    this.#save(it);
    if (place) this.onItem(publicItem(it));
    let ask = false;
    if (!place) {
      const last = this.asked.get(who) || 0;
      ask = this.now() - last > WINDOW_MS;
      if (ask) this.asked.set(who, this.now());
    }
    return { item: it, ask };
  }

  /** The start (and, for videos, the end, where phones often put the moov atom) of a file. */
  #head(id, ext) {
    const file = path.join(this.filesDir, `${id}.${ext}`);
    try {
      const fd = fs.openSync(file, 'r');
      try {
        const size = fs.fstatSync(fd).size;
        const n = Math.min(size, 256 * 1024);
        const a = Buffer.alloc(n);
        fs.readSync(fd, a, 0, n, 0);
        if (size <= n) return a;
        const b = Buffer.alloc(n);
        fs.readSync(fd, b, 0, n, size - n);
        return Buffer.concat([a, b]);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return null;
    }
  }

  /** Placed items in [w, s, e, n] (all placed ones without a box), newest first. */
  list(bbox, limit = 500) {
    const inBox = (it) => !bbox || (it.lng >= bbox[0] && it.lng <= bbox[2] && it.lat >= bbox[1] && it.lat <= bbox[3]);
    return [...this.items.values()]
      .filter((it) => it.lat != null && inBox(it))
      .sort((a, b) => b.t - a.t)
      .slice(0, limit)
      .map(publicItem);
  }

  /** For tools/afpp-admin.sh: everything, placed or not. */
  all() {
    return [...this.items.values()].sort((a, b) => b.t - a.t).map(publicItem);
  }

  filePath(id, ext) {
    const it = this.items.get(id);
    if (!it || !it.ext || it.ext !== ext || !EXT_RE.test(ext)) return null;
    return path.join(this.filesDir, `${id}.${ext}`);
  }

  remove(id) {
    const it = this.items.get(id);
    if (!it) return false;
    this.items.delete(id);
    fs.rmSync(path.join(this.itemsDir, `${id}.json`), { force: true });
    if (it.ext) fs.rmSync(path.join(this.filesDir, `${id}.${it.ext}`), { force: true });
    return true;
  }
}

export const ASK_TEXT =
  '📍 {name}: comparte tu ubicación en los próximos 15 min para poner esto en el mapa público · share your location within 15 min to put this on the public map';
