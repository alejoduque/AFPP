import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAfppServer } from '../server.js';
import crypto from 'node:crypto';
import { sanitizeDerive, intersects } from '../lib/store.js';

let server, base, dataDir;
const ADMIN = 'admin-token-for-tests';

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afpp-test-'));
  server = createAfppServer({
    SERVER_SECRET: 'x'.repeat(32),
    ADMIN_TOKEN: ADMIN,
    DATA_DIR: dataDir,
    MAX_AUDIO_BYTES: '1000',
    ALLOWED_ORIGINS: 'https://afpp.example',
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.closeAllConnections();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function register(deviceId) {
  const res = await fetch(`${base}/devices`, { method: 'POST', body: JSON.stringify({ deviceId }) });
  const { key } = await res.json();
  return { 'X-Device-Id': deviceId, 'X-Device-Key': key };
}

const derive = {
  alias: 'manakai',
  title: 'mañana',
  startTime: '2026-02-22T06:00:00Z',
  breadcrumbs: [
    { lat: 8.438812345, lng: -75.5865, timestamp: 1 },
    { lat: 8.4392, lng: -75.5861, timestamp: 2 },
    { lat: 999, lng: 0 }, // dropped
  ],
  recordings: [{ id: 'recording-1', lat: 8.439, lng: -75.5863, duration: 12, name: 'tángara', tags: ['ave'] }],
};

test('sanitizeDerive rounds, drops bad points, rejects empty', () => {
  const d = sanitizeDerive(derive);
  assert.equal(d.breadcrumbs.length, 2);
  assert.equal(d.breadcrumbs[0].lat, 8.43881);
  assert.throws(() => sanitizeDerive({ breadcrumbs: [{ lat: 'a' }] }));
});

test('intersects', () => {
  assert.ok(intersects([0, 0, 1, 1], [0.5, 0.5, 2, 2]));
  assert.ok(!intersects([0, 0, 1, 1], [2, 2, 3, 3]));
});

test('writes need a valid device key', async () => {
  let res = await fetch(`${base}/derives/derive_1`, { method: 'PUT', body: JSON.stringify(derive) });
  assert.equal(res.status, 401);
  res = await fetch(`${base}/derives/derive_1`, {
    method: 'PUT',
    headers: { 'X-Device-Id': 'phone-a', 'X-Device-Key': 'f'.repeat(64) },
    body: JSON.stringify(derive),
  });
  assert.equal(res.status, 401);
});

test('publish, upload audio, read back by bbox and activity', async () => {
  const a = await register('phone-a');
  let res = await fetch(`${base}/derives/derive_1`, { method: 'PUT', headers: a, body: JSON.stringify(derive) });
  assert.equal(res.status, 200);
  const pub = await res.json();
  assert.equal(pub.owner, undefined, 'owner device id is never public');

  res = await fetch(`${base}/derives/derive_1/recordings/recording-1`, {
    method: 'PUT',
    headers: { ...a, 'Content-Type': 'audio/mp4' },
    body: Buffer.alloc(500, 1),
  });
  assert.equal(res.status, 200);
  const { audio } = await res.json();
  assert.equal(audio, 'audio/derive_1/recording-1.m4a');

  res = await fetch(`${base}/${audio}`, { headers: { Range: 'bytes=0-99' } });
  assert.equal(res.status, 206);
  assert.equal((await res.arrayBuffer()).byteLength, 100);

  res = await fetch(`${base}/derives?bbox=-76,8,-75,9`);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].recordings[0].audio, audio);
  res = await fetch(`${base}/derives?bbox=0,0,1,1`);
  assert.equal((await res.json()).length, 0);

  res = await fetch(`${base}/activity`);
  const [dot] = await res.json();
  assert.equal(dot.id, 'derive_1');
  assert.equal(dot.n, 1);

  // Re-publishing keeps the uploaded audio.
  await fetch(`${base}/derives/derive_1`, { method: 'PUT', headers: a, body: JSON.stringify(derive) });
  res = await fetch(`${base}/derives/derive_1`);
  assert.equal((await res.json()).recordings[0].audio, audio);
});

test('upload limits and types', async () => {
  const a = await register('phone-a');
  let res = await fetch(`${base}/derives/derive_1/recordings/recording-1`, {
    method: 'PUT',
    headers: { ...a, 'Content-Type': 'audio/mp4' },
    body: Buffer.alloc(2000, 1),
  });
  assert.equal(res.status, 413);
  res = await fetch(`${base}/derives/derive_1/recordings/recording-1`, {
    method: 'PUT',
    headers: { ...a, 'Content-Type': 'text/html' },
    body: 'x',
  });
  assert.equal(res.status, 415);
});

test('only the owner (or admin) may change or delete', async () => {
  const b = await register('phone-b');
  let res = await fetch(`${base}/derives/derive_1`, { method: 'DELETE', headers: b });
  assert.equal(res.status, 403);
  res = await fetch(`${base}/derives/derive_1`, { method: 'DELETE', headers: { Authorization: `Bearer ${ADMIN}` } });
  assert.equal(res.status, 200);
  res = await fetch(`${base}/derives/derive_1`);
  assert.equal(res.status, 404);
  assert.ok(!fs.existsSync(path.join(dataDir, 'audio', 'derive_1')));
});

test('the bare base URL describes the API', async () => {
  const res = await fetch(base.replace(/\/api$/, '/'));
  assert.equal(res.status, 200);
  assert.match(await res.text(), /API base/);
});

test('CORS only for allowed origins; path traversal refused', async () => {
  let res = await fetch(`${base}/activity`, { headers: { Origin: 'https://afpp.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://afpp.example');
  res = await fetch(`${base}/activity`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  res = await fetch(`${base}/audio/..%2F..%2Fetc/passwd.m4a`);
  assert.equal(res.status, 404);
});

test('ICE: empty without TURN_HOST; STUN + coturn REST credentials with it', async () => {
  let res = await fetch(`${base}/ice`);
  assert.deepEqual((await res.json()).iceServers, []);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afpp-ice-'));
  const turned = createAfppServer({ SERVER_SECRET: 'x'.repeat(32), DATA_DIR: dir, TURN_HOST: 'turn.example:3478', TURN_SECRET: 'coturn-secret' });
  await new Promise((r) => turned.listen(0, '127.0.0.1', r));
  try {
    res = await fetch(`http://127.0.0.1:${turned.address().port}/api/ice`);
    const { iceServers, ttl } = await res.json();
    assert.equal(iceServers[0].urls, 'stun:turn.example:3478');
    const turn = iceServers[1];
    assert.ok(turn.urls.every((u) => u.startsWith('turn:turn.example:3478')));
    const [expiry, user] = turn.username.split(':');
    assert.equal(user, 'afpp');
    assert.ok(Math.abs(Number(expiry) - (Date.now() / 1000 + ttl)) < 5);
    assert.equal(turn.credential, crypto.createHmac('sha1', 'coturn-secret').update(turn.username).digest('base64'));
  } finally {
    turned.closeAllConnections();
    turned.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
