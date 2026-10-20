#!/usr/bin/env node
/**
 * AFPP — the shared derive server behind the SoundWalk global map.
 *
 * Walkers (the Deriva Sonora app, or the site in a browser) publish a derive
 * they chose to share: its trace, its recordings' metadata, then each
 * recording's audio. The site (altred.xyz/AlpineFeministPunkParade) reads the
 * activity dots, the derives in view, the audio, and an SSE stream of what
 * changes. Plain node:http, no dependencies.
 *
 * Auth without a secret in the APK: a device registers its random deviceId and
 * gets back key = HMAC(SERVER_SECRET, deviceId). Writes carry both; the server
 * recomputes the HMAC. A derive belongs to the device that first published it.
 *
 * Environment: see ./README.md.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Store, ID_RE, AUDIO_TYPES, EXT_TYPES, activityOf, publicView } from './lib/store.js';
import { Bitacora } from './lib/bitacora.js';
import { startIrcLogger } from './lib/irc.js';
import { startTelegram, toTelegram } from './lib/telegram.js';

const MAX_JSON = 2 * 1024 * 1024;

export function createAfppServer(opts = {}) {
  const env = { ...process.env, ...opts };
  const SECRET = env.SERVER_SECRET;
  if (!SECRET || SECRET.length < 16) throw new Error('SERVER_SECRET (16+ chars) is required');
  const ADMIN = env.ADMIN_TOKEN || '';
  const MAX_AUDIO = Number(env.MAX_AUDIO_BYTES || 25 * 1024 * 1024);
  const ORIGINS = String(env.ALLOWED_ORIGINS || 'http://localhost:5173,https://localhost,capacitor://localhost')
    .split(',').map((s) => s.trim()).filter(Boolean);
  // WebRTC for the chat's assembly (voice, ascii, live walks): coturn with use-auth-secret.
  const TURN_SECRET = env.TURN_SECRET || '';
  const TURN_HOST = env.TURN_HOST || '';
  const ICE_TTL = 12 * 3600;
  const store = new Store(env.DATA_DIR || './data');
  const bitacora = new Bitacora(path.join(store.dir, 'bitacora'));
  // A shared derive shows in the bitácora only while it is still shared.
  const visible = (ev) => ev.tipo !== 'deriva' || !!store.get(ev.deriva);
  const tmpDir = path.join(store.dir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const keyFor = (deviceId) => crypto.createHmac('sha256', SECRET).update(deviceId).digest('hex');
  const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  // ------------------------------------------------------------ rate limit
  const buckets = new Map(); // `${kind}:${ip}` -> {n, reset}
  function limited(kind, ip, max, windowMs) {
    const k = `${kind}:${ip}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < now) buckets.set(k, (b = { n: 0, reset: now + windowMs }));
    return ++b.n > max;
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  }, 60_000);
  sweep.unref();

  // ------------------------------------------------------------ SSE
  const listeners = new Set();
  function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of listeners) res.write(msg);
  }
  const ping = setInterval(() => {
    for (const res of listeners) res.write(': ping\n\n');
  }, 25_000);
  ping.unref();

  function logEvent(ev) {
    broadcast('bitacora', bitacora.add(ev));
  }

  // #AFPP → bitácora (and → Telegram), through the local Ergo (IRC_HOST unset = no bot, e.g. tests).
  const PUBLIC_URL = (env.PUBLIC_URL || 'https://altred.xyz/AlpineFeministPunkParade/').replace(/\/?$/, '/');
  let telegram = null;
  const irc = env.IRC_HOST
    ? startIrcLogger({
        host: env.IRC_HOST,
        port: Number(env.IRC_PORT || 6667),
        channel: env.IRC_CHANNEL || '#AFPP',
        onLine: ({ nick, texto, tbt }) => {
          logEvent({ tipo: 'chat', nick, texto, ...(tbt ? { tbt } : {}) });
          telegram?.send(toTelegram({ nick, texto }));
        },
      })
    : null;

  // Telegram group ↔ #AFPP (TELEGRAM_TOKEN + TELEGRAM_CHAT in /etc/afpp/afpp.env).
  if (irc && env.TELEGRAM_TOKEN && env.TELEGRAM_CHAT) {
    telegram = startTelegram({
      token: env.TELEGRAM_TOKEN,
      chatId: env.TELEGRAM_CHAT,
      api: env.TELEGRAM_API || undefined,
      onMessage: ({ name, text, lines }) => {
        lines.forEach((l) => irc.say(l));
        logEvent({ tipo: 'chat', nick: name, texto: text, fuente: 'telegram' });
      },
    });
  }

  // ------------------------------------------------------------ helpers
  /**
   * ICE servers for the browsers' peer connections. STUN on TURN_HOST, and TURN
   * with coturn's REST credentials (use-auth-secret): username = expiry:afpp,
   * credential = base64(HMAC-SHA1(TURN_SECRET, username)), valid ICE_TTL. With
   * neither set, the list is empty and calls connect only inside one network.
   */
  function iceServers() {
    if (!TURN_HOST) return [];
    const list = [{ urls: `stun:${TURN_HOST}` }];
    if (TURN_SECRET) {
      const username = `${Math.floor(Date.now() / 1000) + ICE_TTL}:afpp`;
      const credential = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
      list.push({ urls: [`turn:${TURN_HOST}?transport=udp`, `turn:${TURN_HOST}?transport=tcp`], username, credential });
    }
    return list;
  }

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && (ORIGINS.includes('*') || ORIGINS.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id, X-Device-Key, Authorization, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  function send(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(json);
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_JSON) {
          reject(Object.assign(new Error('body too large'), { status: 413 }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          reject(Object.assign(new Error('invalid JSON'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  /** The calling device, if its key checks out; null otherwise. */
  function device(req) {
    const id = String(req.headers['x-device-id'] || '');
    const key = String(req.headers['x-device-key'] || '');
    if (!ID_RE.test(id) || !key) return null;
    return safeEq(key, keyFor(id)) ? id : null;
  }

  const isAdmin = (req) => !!ADMIN && safeEq(String(req.headers.authorization || ''), `Bearer ${ADMIN}`);

  function serveAudio(req, res, id, file) {
    const m = /^([A-Za-z0-9][A-Za-z0-9_.-]{0,99})\.([a-z0-9]{2,4})$/.exec(file);
    if (!ID_RE.test(id) || !m || !EXT_TYPES[m[2]]) return send(res, 404, { error: 'not found' });
    const full = store.audioPath(id, m[1], m[2]);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      return send(res, 404, { error: 'not found' });
    }
    const headers = {
      'Content-Type': EXT_TYPES[m[2]],
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      let start = range[1] === '' ? stat.size - Number(range[2]) : Number(range[1]);
      let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : stat.size - 1;
      start = Math.max(0, start);
      end = Math.min(end, stat.size - 1);
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(full, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  }

  function receiveAudio(req, res, d, rid) {
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = AUDIO_TYPES[type];
    if (!ext) return send(res, 415, { error: `unsupported type ${type || '(none)'}` });
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > MAX_AUDIO) return send(res, 413, { error: 'audio too large' });
    const tmp = path.join(tmpDir, `${crypto.randomUUID()}.${ext}`);
    const out = fs.createWriteStream(tmp);
    let size = 0;
    let failed = false;
    const fail = (status, error) => {
      if (failed) return;
      failed = true;
      out.destroy();
      fs.rmSync(tmp, { force: true });
      send(res, status, { error });
    };
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_AUDIO) {
        fail(413, 'audio too large');
        req.destroy();
      }
    });
    req.on('error', () => fail(400, 'upload interrupted'));
    req.pipe(out);
    out.on('finish', () => {
      if (failed) return;
      if (!size) return fail(400, 'empty body');
      try {
        const updated = store.attachAudio(d.id, rid, ext, tmp);
        broadcast('derive', activityOf(updated));
        send(res, 200, { ok: true, audio: `audio/${d.id}/${rid}.${ext}` });
      } catch (e) {
        fail(404, e.message);
      }
    });
  }

  // ------------------------------------------------------------ routes
  async function route(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    // Accept both /api/... and /afpp/api/... so it can sit behind a path prefix.
    if (parts[0] === 'afpp') parts.shift();
    // The bare base URL (what VITE_AFPP_API points at): say what this is.
    if (parts.length === 1 && parts[0] === '' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      return res.end(
        'AFPP: shared derives for the SoundWalk global map.\n\n' +
          'This is the API base (VITE_AFPP_API), not a page. Endpoints:\n' +
          '  api/health      status\n' +
          '  api/activity    one dot per shared derive\n' +
          '  api/derives?bbox=w,s,e,n\n' +
          '  api/events      live updates (server-sent events)\n' +
          '  api/ice         STUN/TURN servers for the chat\'s voice and video\n' +
          '  api/bitacora.json   the AFPP bitácora: #AFPP chat + shared derives\n',
      );
    }
    if (parts[0] !== 'api') return send(res, 404, { error: 'not found' });
    const [, a, b, c, d2] = parts;
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const write = req.method !== 'GET' && req.method !== 'HEAD';
    if (write && limited('w', ip, 120, 60_000)) return send(res, 429, { error: 'slow down' });

    if (a === 'health' && req.method === 'GET') return send(res, 200, { ok: true, derives: store.derives.size });

    if (a === 'devices' && !b && req.method === 'POST') {
      if (limited('dev', ip, 20, 3_600_000)) return send(res, 429, { error: 'slow down' });
      const { deviceId } = await readJson(req);
      if (!ID_RE.test(String(deviceId || ''))) return send(res, 400, { error: 'invalid deviceId' });
      return send(res, 200, { deviceId, key: keyFor(deviceId) });
    }

    if (a === 'ice' && req.method === 'GET') {
      if (limited('ice', ip, 60, 3_600_000)) return send(res, 429, { error: 'slow down' });
      return send(res, 200, { iceServers: iceServers(), ttl: ICE_TTL });
    }

    if (a === 'activity' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, max-age=15');
      return send(res, 200, store.activity());
    }

    if (a === 'events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 5000\n\n');
      listeners.add(res);
      req.on('close', () => listeners.delete(res));
      return;
    }

    if (a === 'audio' && b && c && (req.method === 'GET' || req.method === 'HEAD')) return serveAudio(req, res, b, c);

    if (a === 'bitacora.json' && req.method === 'GET') {
      const solo = ['chat', 'deriva'].includes(url.searchParams.get('solo')) ? url.searchParams.get('solo') : null;
      const limit = Number(url.searchParams.get('ultimos')) || 200;
      res.setHeader('Access-Control-Allow-Origin', '*');
      return send(res, 200, { eventos: bitacora.recent({ solo, limit, visible }), dias: bitacora.days() });
    }

    if (a === 'bitacora' && b && req.method === 'GET') {
      const text = bitacora.dayText(b.replace(/\.txt$/, ''), visible);
      if (text == null) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(text);
    }

    if (a === 'derives') {
      if (!b && req.method === 'GET') {
        const bbox = String(url.searchParams.get('bbox') || '').split(',').map(Number);
        if (bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) return send(res, 400, { error: 'bbox=w,s,e,n required' });
        return send(res, 200, store.inBbox(bbox).map(publicView));
      }
      if (!b || !ID_RE.test(b)) return send(res, 404, { error: 'not found' });
      const existing = store.get(b);

      if (!c && req.method === 'GET') return existing ? send(res, 200, publicView(existing)) : send(res, 404, { error: 'not found' });

      const dev = device(req);
      const admin = isAdmin(req);
      if (write && !dev && !admin) return send(res, 401, { error: 'device key required' });
      if (existing && !admin && existing.owner !== dev) return send(res, 403, { error: 'not your derive' });

      if (!c && req.method === 'PUT') {
        let saved;
        try {
          saved = store.put(b, existing?.owner || dev, await readJson(req));
        } catch (e) {
          return send(res, e.status || 400, { error: e.message });
        }
        broadcast('derive', activityOf(saved));
        if (!existing) {
          const { lat, lng } = activityOf(saved);
          logEvent({ tipo: 'deriva', deriva: saved.id, alias: saved.alias, titulo: saved.title, n: saved.recordings.length, lat, lng });
          telegram?.send(`◍ ${saved.alias} shared ${saved.title ? `«${saved.title}»` : 'a derive'} · ${saved.recordings.length} sounds · ${PUBLIC_URL}#${lat.toFixed(4)},${lng.toFixed(4)}`);
        }
        return send(res, 200, publicView(saved));
      }

      if (!c && req.method === 'DELETE') {
        if (!existing) return send(res, 404, { error: 'not found' });
        store.remove(b);
        broadcast('remove', { id: b });
        return send(res, 200, { ok: true });
      }

      if (c === 'recordings' && d2 && req.method === 'PUT') {
        if (!existing) return send(res, 404, { error: 'publish the derive first' });
        if (!existing.recordings.some((r) => r.id === d2)) return send(res, 404, { error: 'unknown recording' });
        return receiveAudio(req, res, existing, d2);
      }
    }

    return send(res, 404, { error: 'not found' });
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'server error' });
    });
  });
  server.on('close', () => {
    irc?.stop();
    telegram?.stop();
    clearInterval(ping);
    clearInterval(sweep);
    for (const res of listeners) res.end();
  });
  server.store = store;
  server.keyFor = keyFor;
  server.bitacora = bitacora;
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const port = Number(process.env.PORT || 8790);
  const host = process.env.HOST || '127.0.0.1';
  createAfppServer().listen(port, host, () => console.log(`afpp listening on http://${host}:${port}`));
}
