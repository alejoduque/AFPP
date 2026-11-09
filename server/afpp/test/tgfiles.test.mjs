import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { mediaOf, extFor, placeFor, exifGps, mp4Gps, WINDOW_MS } from '../lib/tgfiles.js';
import { createAfppServer } from '../server.js';

const CHAT = -1004345678231;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A tiny JPEG whose EXIF says it was taken at lat, lng. */
function exifJpeg(lat, lng, le = true) {
  const t = Buffer.alloc(128);
  const u16 = (v, o) => (le ? t.writeUInt16LE(v, o) : t.writeUInt16BE(v, o));
  const u32 = (v, o) => (le ? t.writeUInt32LE(v, o) : t.writeUInt32BE(v, o));
  t.write(le ? 'II' : 'MM', 0, 'latin1');
  u16(42, 2);
  u32(8, 4);
  u16(1, 8); // IFD0: one entry, the GPS pointer
  u16(0x8825, 10); u16(4, 12); u32(1, 14); u32(26, 18);
  u32(0, 22);
  u16(4, 26); // GPS IFD: 4 entries
  const entry = (i, tag, type, count, value) => {
    const o = 28 + i * 12;
    u16(tag, o); u16(type, o + 2); u32(count, o + 4);
    if (typeof value === 'string') t.write(value, o + 8, 'latin1');
    else u32(value, o + 8);
  };
  entry(0, 1, 2, 2, lat < 0 ? 'S\0' : 'N\0');
  entry(1, 2, 5, 3, 80);
  entry(2, 3, 2, 2, lng < 0 ? 'W\0' : 'E\0');
  entry(3, 4, 5, 3, 104);
  const dms = (v, o) => {
    v = Math.abs(v);
    const d = Math.floor(v);
    const m = Math.floor((v - d) * 60);
    const s = Math.round(((v - d) * 60 - m) * 60 * 1000);
    [[d, 1], [m, 1], [s, 1000]].forEach(([n, den], i) => { u32(n, o + i * 8); u32(den, o + i * 8 + 4); });
  };
  dms(lat, 80);
  dms(lng, 104);
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(app1.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, app1, Buffer.from([0xff, 0xd9])]);
}

test('mediaOf: the largest photo, documents by their type', () => {
  const photo = mediaOf({ photo: [{ file_id: 's', width: 90, height: 90 }, { file_id: 'L', width: 1280, height: 960, file_size: 99 }] });
  assert.deepEqual([photo.kind, photo.fileId, photo.mime], ['photo', 'L', 'image/jpeg']);
  assert.equal(mediaOf({ voice: { file_id: 'v', mime_type: 'audio/ogg' } }).kind, 'sound');
  assert.equal(mediaOf({ video_note: { file_id: 'n' } }).kind, 'video');
  assert.equal(mediaOf({ document: { file_id: 'd', mime_type: 'image/jpeg', file_name: 'IMG.jpg' } }).kind, 'photo');
  assert.equal(mediaOf({ document: { file_id: 'd', mime_type: 'application/pdf' } }).kind, 'file');
  assert.equal(mediaOf({ text: 'hola' }), null);
  assert.equal(extFor('photos/file_1.jpg', 'image/jpeg', 'photo'), 'jpg');
  assert.equal(extFor('voice/file_2.oga', 'audio/ogg', 'sound'), 'oga');
  assert.equal(extFor('documents/file_3', 'application/pdf', 'file'), 'pdf');
  assert.equal(extFor('documents/file_4', 'application/x-thing', 'file'), 'bin');
});

test('placeFor: nearest within the window, a live location first', () => {
  const t = 1_000_000_000;
  const pts = [
    { lat: 1, lng: 1, t: t - 10 * 60e3, live: false },
    { lat: 2, lng: 2, t: t + 60e3, live: false },
    { lat: 3, lng: 3, t: t - 14 * 60e3, live: true },
  ];
  assert.deepEqual(placeFor(pts, t), { lat: 3, lng: 3, how: 'live' });
  assert.deepEqual(placeFor(pts.slice(0, 2), t), { lat: 2, lng: 2, how: 'location' });
  assert.equal(placeFor([{ lat: 1, lng: 1, t: t - WINDOW_MS - 1 }], t), null);
  assert.equal(placeFor(undefined, t), null);
});

test('GPS inside files: EXIF (both byte orders) and a phone video', () => {
  assert.deepEqual(exifGps(exifJpeg(46.8508, 9.5320)), { lat: 46.8508, lng: 9.532 });
  assert.deepEqual(exifGps(exifJpeg(-33.4489, -70.6693, false)), { lat: -33.4489, lng: -70.6693 });
  assert.equal(exifGps(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), null);
  assert.equal(exifGps(Buffer.from('not a jpeg')), null);
  const mov = Buffer.concat([Buffer.alloc(40), Buffer.from([0xa9, 0x78, 0x79, 0x7a]), Buffer.from('\0\x12\x15\xc7+08.4388-075.5865/', 'latin1'), Buffer.alloc(20)]);
  assert.deepEqual(mp4Gps(mov), { lat: 8.4388, lng: -75.5865 });
  assert.equal(mp4Gps(Buffer.alloc(100)), null);
});

test('the group: files land on the map where their senders were', async () => {
  const now = Math.floor(Date.now() / 1000);
  const msg = (id, from, extra, dt = 0) => ({ message_id: id, date: now + dt, chat: { id: CHAT }, from, ...extra });
  const ana = { id: 9, username: 'ana' };
  const bo = { id: 10, first_name: 'Bo Real' };
  const cy = { id: 11, username: 'cy' };
  const files = {
    'photos/p1.jpg': Buffer.from('JPEGDATA'),
    'voice/v1.oga': Buffer.from('OGGDATA'),
    'documents/d1.jpg': exifJpeg(35.0116, 135.7681),
    'documents/x.html': Buffer.from('<script>alert(1)</script>'),
  };
  const batches = [
    [{ update_id: 1, message: msg(1, ana, { location: { latitude: 46.85, longitude: 9.53 } }) }],
    [{ update_id: 2, message: msg(2, ana, { photo: [{ file_id: 'P1', width: 800, height: 600 }], caption: 'die Alp' }, 60) }],
    [{ update_id: 3, message: msg(3, bo, { voice: { file_id: 'V1', mime_type: 'audio/ogg' } }) }],
    [{ update_id: 4, message: msg(4, cy, { document: { file_id: 'D1', mime_type: 'image/jpeg', file_name: 'IMG_1.jpg' } }) }],
    [{ update_id: 5, message: msg(5, cy, { document: { file_id: 'X1', mime_type: 'text/html', file_name: 'x.html' } }) }],
    [{ update_id: 6, edited_message: { ...msg(6, bo, { location: { latitude: 8.4388, longitude: -75.5865, live_period: 900 } }, 0), edit_date: now + 120 } }],
  ];
  const paths = { P1: 'photos/p1.jpg', V1: 'voice/v1.oga', D1: 'documents/d1.jpg', X1: 'documents/x.html' };
  const sent = [];
  const tg = http.createServer((req, res) => {
    if (req.url.startsWith('/file/botTEST/')) {
      const f = files[req.url.slice('/file/botTEST/'.length)];
      if (!f) return res.writeHead(404).end();
      return res.end(f);
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/getUpdates')) {
        const next = batches.shift();
        if (next) return res.end(JSON.stringify({ ok: true, result: next }));
        return setTimeout(() => res.end(JSON.stringify({ ok: true, result: [] })), 200);
      }
      if (req.url.endsWith('/getFile')) return res.end(JSON.stringify({ ok: true, result: { file_id: b.file_id, file_path: paths[b.file_id] } }));
      if (req.url.endsWith('/sendMessage')) {
        sent.push(b);
        return res.end(JSON.stringify({ ok: true, result: {} }));
      }
      res.end(JSON.stringify({ ok: false, description: 'unknown' }));
    });
  });
  await new Promise((r) => tg.listen(0, '127.0.0.1', r));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afpp-tgf-'));
  const ADMIN = 'adm';
  const server = createAfppServer({
    SERVER_SECRET: 'z'.repeat(32), DATA_DIR: dataDir, ADMIN_TOKEN: ADMIN,
    TELEGRAM_TOKEN: 'TEST', TELEGRAM_CHAT: String(CHAT), TELEGRAM_API: `http://127.0.0.1:${tg.address().port}`,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    await wait(1500);
    const items = await (await fetch(`${base}/telegram`)).json();
    const by = Object.fromEntries(items.map((it) => [it.id, it]));
    const id = (n) => `tg${Math.abs(CHAT)}_${n}`;

    // ana: a location, then a photo a minute later → placed there
    assert.deepEqual([by[id(2)].name, by[id(2)].kind, by[id(2)].lat, by[id(2)].lng, by[id(2)].how, by[id(2)].caption], ['ana', 'photo', 46.85, 9.53, 'location', 'die Alp']);
    // cy: a photo sent as a file → its own EXIF
    assert.deepEqual([by[id(4)].lat, by[id(4)].lng, by[id(4)].how], [35.0116, 135.7681, 'file']);
    // bo: a voice note with no location → asked once, then placed by a live location
    assert.ok(sent.some((m) => m.reply_to_message_id === 3 && /📍 anon-[0-9a-f]{6}:/.test(m.text)), 'the bot asked bo');
    assert.equal(sent.filter((m) => m.reply_to_message_id === 3).length, 1);
    assert.equal(sent.some((m) => /Bo Real|"id"/.test(m.text)), false, 'never a real name');
    assert.deepEqual([by[id(3)].lat, by[id(3)].lng, by[id(3)].how, by[id(3)].kind], [8.4388, -75.5865, 'live', 'sound']);
    assert.ok(!('who' in by[id(3)]), 'no Telegram identity in public');
    // cy's html, unplaced (no location): stored, not shown
    assert.equal(by[id(5)], undefined);

    // the files: inline for safe types, with Range; anything else only as a download
    let r = await fetch(`${base}/${by[id(2)].file}`, { headers: { Range: 'bytes=0-3' } });
    assert.equal(r.status, 206);
    assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.equal(await r.text(), 'JPEG');
    r = await fetch(`${base}/${by[id(3)].file}`);
    assert.equal(r.headers.get('content-type'), 'audio/ogg');
    const all = await (await fetch(`${base}/telegram?all=1`, { headers: { Authorization: `Bearer ${ADMIN}` } })).json();
    const html = all.find((it) => it.id === id(5));
    assert.ok(html && html.lat === null);
    r = await fetch(`${base}/${html.file}`);
    assert.equal(r.headers.get('content-type'), 'application/octet-stream');
    assert.match(r.headers.get('content-disposition'), /^attachment/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await fetch(`${base}/telegram/file/..%2F..%2Fetc.json`)).status, 404);
    assert.equal((await fetch(`${base}/telegram?all=1`)).status, 401);

    // bbox, and the admin's delete
    assert.deepEqual((await (await fetch(`${base}/telegram?bbox=0,40,20,50`)).json()).map((it) => it.id), [id(2)]);
    assert.equal((await fetch(`${base}/telegram/${id(2)}`, { method: 'DELETE' })).status, 401);
    assert.equal((await fetch(`${base}/telegram/${id(2)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ADMIN}` } })).status, 200);
    assert.equal((await fetch(`${base}/${by[id(2)].file}`)).status, 404);
    assert.ok(!fs.existsSync(path.join(dataDir, 'telegram', 'files', `${id(2)}.jpg`)));
  } finally {
    server.closeAllConnections();
    server.close();
    tg.closeAllConnections();
    tg.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
