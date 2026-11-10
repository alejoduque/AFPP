import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mixAt, addVoice, toPcm16, Ring, RingCast, icecastTarget, MAX_SOURCES } from '../lib/ring.js';
import { mixAt as clientMixAt } from '../../../src/afpp/mix.mjs';
import { Store } from '../lib/store.js';
import { createAfppServer } from '../server.js';

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
let dir;
let store;

/** A shared derive with two sounds (real WAV files) and one without audio. */
function seed(s, root) {
  s.put('walk1', 'dev1', {
    alias: 'kamo',
    title: 'river',
    breadcrumbs: [{ lat: 35, lng: 135.7, t: 1 }],
    recordings: [
      { id: 'a', lat: 35, lng: 135.7, duration: 1, name: 'river', tags: ['geophony'] },
      { id: 'b', lat: 35, lng: 135.7, duration: 1, name: 'bird', tags: ['biophony'] },
      { id: 'c', lat: 35, lng: 135.7, duration: 1, name: 'no audio' },
    ],
  });
  for (const [rid, hz] of [['a', 220], ['b', 880]]) {
    const tmp = path.join(root, `${rid}.wav`);
    if (HAS_FFMPEG) spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=1`, '-y', tmp]);
    else fs.writeFileSync(tmp, Buffer.alloc(64));
    s.attachAudio('walk1', rid, 'wav', tmp);
  }
}

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afpp-ring-'));
  store = new Store(path.join(dir, 'data'));
  seed(store, dir);
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('the server mixes as the browser rings do', () => {
  for (let x = 0; x <= 1; x += 0.05) {
    for (let y = 0; y <= 1; y += 0.05) {
      const a = mixAt(x, y);
      const b = clientMixAt(x, y);
      assert.equal(a.inside, b.inside);
      assert.ok(Math.abs(a.gain - b.gain) < 1e-12 && Math.abs(a.pan - b.pan) < 1e-12);
    }
  }
});

test('addVoice: equal-power pan, ramps without a jump', () => {
  const mono = new Int16Array(100).fill(16384); // 0.5
  const out = new Float32Array(200);
  addVoice(out, mono, 1, 0, 1, 0);
  assert.ok(Math.abs(out[0] - 0.5 * Math.SQRT1_2) < 1e-6 && Math.abs(out[1] - 0.5 * Math.SQRT1_2) < 1e-6);
  const left = new Float32Array(200);
  addVoice(left, mono, 1, -1, 1, -1);
  assert.ok(Math.abs(left[0] - 0.5) < 1e-6 && Math.abs(left[1]) < 1e-6);
  const ramp = new Float32Array(200);
  addVoice(ramp, mono, 0, 0, 1, 0);
  assert.equal(ramp[0], 0);
  assert.ok(ramp[198] > ramp[100] && ramp[100] > ramp[2]);
});

test('toPcm16 saturates softly instead of wrapping', () => {
  const pcm = toPcm16(Float32Array.from([0, 0.5, 3, -3]));
  assert.equal(pcm.readInt16LE(0), 0);
  assert.equal(pcm.readInt16LE(2), Math.round(0.5 * 32767));
  assert.ok(pcm.readInt16LE(4) > 30000 && pcm.readInt16LE(4) <= 32767);
  assert.ok(pcm.readInt16LE(6) < -30000);
});

test('Ring: only shared sounds with audio, clamped, at most MAX_SOURCES', () => {
  const changes = [];
  const ring = new Ring({ store, file: path.join(dir, 'ring1.json'), onChange: (s) => changes.push(s) });
  assert.throws(() => ring.apply({ op: 'add', id: 'walk1/c', x: 0.5, y: 0.5 }), /audio/);
  assert.throws(() => ring.apply({ op: 'add', id: '../etc/x', x: 0.5, y: 0.5 }), /audio/);
  assert.throws(() => ring.apply({ op: 'jump', id: 'walk1/a' }), /op/);
  assert.throws(() => ring.apply({ op: 'add', id: 'walk1/a' }), /x and y/);
  assert.ok(ring.apply({ op: 'add', id: 'walk1/a', x: 5, y: -1 }));
  const s = ring.state();
  assert.deepEqual(s.sources.map((x) => [x.id, x.x, x.y, x.name, x.alias, x.audio]), [['walk1/a', 0.97, 0.03, 'river', 'kamo', 'audio/walk1/a.wav']]);
  assert.equal(changes.length, 1);
  // outside the sonar: in the state, silent in the mix
  assert.equal(ring.voices().length, 0);
  ring.apply({ op: 'move', id: 'walk1/a', x: 0.5, y: 0.5 });
  assert.deepEqual(ring.voices().map((v) => [v.id, v.gain, v.pan]), [['walk1/a', 1, 0]]);
  assert.ok(ring.apply({ op: 'remove', id: 'walk1/a' }));
  assert.equal(ring.apply({ op: 'remove', id: 'walk1/a' }), false);
  assert.ok(MAX_SOURCES >= 2);
});

test('Ring: kept across a restart; an unshared derive leaves it', async () => {
  const file = path.join(dir, 'ring2.json');
  const ring = new Ring({ store, file });
  ring.apply({ op: 'add', id: 'walk1/b', x: 0.4, y: 0.5 });
  await new Promise((r) => setTimeout(r, 1200)); // saved after a second
  const again = new Ring({ store, file });
  assert.deepEqual(again.state().sources.map((s) => s.id), ['walk1/b']);
  const other = new Store(path.join(dir, 'data2'));
  seed(other, dir);
  const r3 = new Ring({ store: other, file: path.join(dir, 'ring3.json') });
  r3.apply({ op: 'add', id: 'walk1/a', x: 0.5, y: 0.5 });
  other.remove('walk1');
  r3.prune();
  assert.equal(r3.state().sources.length, 0);
});

test('icecastTarget', () => {
  assert.equal(icecastTarget({}), null);
  assert.equal(icecastTarget({ ICECAST_URL: 'http://127.0.0.1:8000' }), null);
  assert.equal(
    icecastTarget({ ICECAST_URL: 'http://127.0.0.1:8000', ICECAST_SOURCE_PASSWORD: 'p@ss/w:rd' }),
    'icecast://source:p%40ss%2Fw%3Ard@127.0.0.1:8000/afpp-rings.mp3',
  );
  assert.equal(icecastTarget({ ICECAST_URL: 'http://localhost', ICECAST_SOURCE_PASSWORD: 'x', ICECAST_MOUNT: 'r.mp3' }), 'icecast://source:x@localhost:8000/r.mp3');
});

test('RingCast: two sounds in the ring become one MP3 stream', { skip: !HAS_FFMPEG && 'no ffmpeg' }, async () => {
  const out = path.join(dir, 'rings.mp3');
  const ring = new Ring({ store, file: path.join(dir, 'ring4.json') });
  const cast = new RingCast({ ring, target: out, idleMs: 300 });
  ring.onChange = () => cast.update();
  const release = cast.listen(); // someone listening
  ring.apply({ op: 'add', id: 'walk1/a', x: 0.3, y: 0.5 }); // left
  ring.apply({ op: 'add', id: 'walk1/b', x: 0.7, y: 0.5 }); // right
  assert.equal(ring.streaming, true);
  await new Promise((r) => setTimeout(r, 1500));
  ring.apply({ op: 'move', id: 'walk1/b', x: 0.5, y: 0.5 });
  await new Promise((r) => setTimeout(r, 700));
  ring.apply({ op: 'clear' });
  await new Promise((r) => setTimeout(r, 1500)); // idle → stops by itself
  assert.equal(ring.streaming, false);
  release();
  await new Promise((r) => setTimeout(r, 500));
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,channels,sample_rate', '-of', 'json', out], { encoding: 'utf8' });
  const info = JSON.parse(probe.stdout);
  assert.equal(info.streams[0].codec_name, 'mp3');
  assert.equal(info.streams[0].channels, 2);
  assert.equal(info.streams[0].sample_rate, '44100');
  const secs = Number(info.format.duration);
  assert.ok(secs > 2 && secs < 5, `duration ${secs}`); // real time, not a burst
  // the first second: 220 Hz mostly on the left, 880 Hz mostly on the right
  const vol = (ch) => {
    const r = spawnSync('ffmpeg', ['-v', 'info', '-t', '1.2', '-i', out, '-af', `pan=mono|c0=${ch},volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
    return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)[1]);
  };
  assert.ok(vol('c0') > -40 && vol('c1') > -40, 'both channels sound');
});

test('API: /ring is shared through POST and SSE; no stream without Icecast', async () => {
  const data = path.join(dir, 'api');
  const s = new Store(data);
  seed(s, dir);
  const server = createAfppServer({ SERVER_SECRET: 'x'.repeat(32), DATA_DIR: data });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const events = [];
    const ctrl = new AbortController();
    const sse = await fetch(`${base}/events`, { signal: ctrl.signal });
    const reader = sse.body.getReader();
    (async () => {
      const dec = new TextDecoder();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          events.push(dec.decode(value));
        }
      } catch {
        // aborted
      }
    })();
    const post = (body) => fetch(`${base}/ring`, { method: 'POST', body: JSON.stringify(body) });
    let res = await post({ op: 'add', id: 'walk1/a', x: 0.5, y: 0.5 });
    assert.equal(res.status, 200);
    const st = await res.json();
    assert.equal(st.stream, false);
    assert.equal(st.sources[0].id, 'walk1/a');
    assert.equal((await post({ op: 'add', id: 'walk1/c', x: 0.5, y: 0.5 })).status, 404);
    assert.equal((await post({ op: 'nope' })).status, 400);
    res = await fetch(`${base}/ring`);
    assert.equal((await res.json()).sources.length, 1);
    assert.equal((await fetch(`${base}/ring.mp3`)).status, 503);
    // many moves are fine (a drag), well past the general write limit
    for (let i = 0; i < 130; i++) await post({ op: 'move', id: 'walk1/a', x: 0.5, y: 0.4 + (i % 10) / 100 });
    assert.equal((await post({ op: 'move', id: 'walk1/a', x: 0.5, y: 0.5 })).status, 200);
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(events.join('').includes('event: ring'));
    ctrl.abort();
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('a server restarted with sounds in the shared rings starts, keeps them, streams nothing yet', { skip: !HAS_FFMPEG && 'no ffmpeg' }, async () => {
  const data = path.join(dir, 'restart');
  const s = new Store(data);
  seed(s, dir);
  fs.writeFileSync(path.join(data, 'ring.json'), JSON.stringify({ sources: [{ id: 'walk1/a', x: 0.5, y: 0.5 }] }));
  const out = path.join(dir, 'restart.mp3');
  const server = createAfppServer({ SERVER_SECRET: 'x'.repeat(32), DATA_DIR: data, RING_OUT: out });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await new Promise((r) => setTimeout(r, 600));
    const st = await (await fetch(`http://127.0.0.1:${server.address().port}/api/ring`)).json();
    // the arrangement is kept, but nothing streams until someone listens
    assert.deepEqual([st.sources.map((x) => x.id), st.streaming, st.stream], [['walk1/a'], false, true]);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('RingCast streams only while someone listens; the arrangement stays', { skip: !HAS_FFMPEG && 'no ffmpeg' }, async () => {
  const ring = new Ring({ store, file: path.join(dir, 'ring5.json') });
  const cast = new RingCast({ ring, target: path.join(dir, 'listen.mp3'), graceMs: 400, wantMs: 300 });
  ring.onChange = () => cast.update();
  const later = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    ring.apply({ op: 'add', id: 'walk1/a', x: 0.5, y: 0.5 });
    assert.equal(ring.streaming, false, 'a sound inside, nobody listening: silent');
    assert.equal(cast.want(), true);
    assert.equal(ring.streaming, true, 'someone asks: it starts');
    const release = cast.listen();
    await later(700);
    assert.equal(ring.streaming, true, 'kept going while they listen (past the grace)');
    release();
    release(); // twice is harmless
    assert.equal(cast.listeners, 0);
    await later(700);
    assert.equal(ring.streaming, false, 'stopped after the grace with nobody left');
    assert.deepEqual(ring.state().sources.map((x) => x.id), ['walk1/a'], 'the arrangement stays');

    // somebody waiting on an empty ring hears the first sound at once
    ring.apply({ op: 'clear' });
    assert.equal(cast.want(), false, 'empty ring: nothing to hear');
    assert.equal(ring.streaming, false);
    ring.apply({ op: 'add', id: 'walk1/b', x: 0.5, y: 0.5 });
    assert.equal(ring.streaming, true, 'a sound dropped in while someone waits starts it');
    await later(800);
    assert.equal(ring.streaming, false, 'and they never connected: stops after the grace');
    await later(400); // the asking moment has passed
    ring.apply({ op: 'move', id: 'walk1/b', x: 0.45, y: 0.5 });
    assert.equal(ring.streaming, false, 'moves with nobody around do not start it');
  } finally {
    cast.stop();
  }
});
