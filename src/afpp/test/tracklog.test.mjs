import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimes, toTrace, boundsOf, fitView, timeline, at, soundsUntil, playOrder, niceStep, TRACK_MIN_MS, TRACK_MAX_MS } from '../tracklog.mjs';
import { packCrumb, unpackCrumbs, readWalkMessage, applyWalkMessage, MAX_LIVE_CRUMBS } from '../walks.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const MIN = 60_000;

// A 40-minute walk heading north-east from Chur, three sounds.
const derive = {
  id: 'derive_1',
  alias: 'ana',
  title: 'Rhein',
  startTime: 0,
  endTime: 40 * MIN,
  breadcrumbs: Array.from({ length: 41 }, (_, i) => ({ lat: 46.85 + i * 0.0002, lng: 9.53 + i * 0.0003, t: i * MIN })),
  recordings: [
    { id: 'r2', lat: 46.854, lng: 9.536, timestamp: 20 * MIN, name: 'river', duration: 30, audio: 'audio/derive_1/r2.m4a' },
    { id: 'r1', lat: 46.851, lng: 9.5315, timestamp: 5 * MIN, name: 'bells', duration: 12, audio: null },
    { id: 'r3', lat: 46.858, lng: 9.542, name: 'no time' }, // takes the nearest crumb's time
  ],
};

test('toTrace: crumbs keep their times, sounds sorted, a missing time from the nearest crumb', () => {
  const tr = toTrace(derive);
  assert.equal(tr.crumbs.length, 41);
  assert.deepEqual(tr.sounds.map((s) => s.id), ['r1', 'r2', 'r3']);
  assert.equal(tr.sounds[2].t, 40 * MIN);
  assert.equal(tr.live, false);
});

test('withTimes spreads untimed crumbs between start and end, or 2 s apart', () => {
  const pts = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }];
  assert.deepEqual(withTimes(pts, 1000, 5000).map((c) => c.t), [1000, 3000, 5000]);
  assert.deepEqual(withTimes(pts).map((c) => c.t), [0, 2000, 4000]);
  // times that go backwards are not trusted
  assert.deepEqual(withTimes([{ lat: 1, lng: 1, t: 9 }, { lat: 1, lng: 1, t: 3 }]).map((c) => c.t), [0, 2000]);
});

test('fitView frames the walk at street scale, and one point at least ~60 m', () => {
  const tr = toTrace(derive);
  const v = fitView(tr, { w: 600, h: 400 });
  near(v.center[1], (46.85 + 46.858) / 2, 1e-9);
  // the walk's height (0.008° ≈ 890 m) fills about 70 % of 400 px
  const base = 400 / 2 - 6;
  const px = 0.008 * (Math.PI / 180) * base * v.zoom;
  assert.ok(px <= 400 * 0.7 + 1e-6, `${px}`);
  assert.ok(v.zoom > 1000);
  // framed above an overlay: the projection's base stays the whole canvas's
  const framed = fitView(tr, { w: 600, h: 300, base });
  const framedPx = 0.008 * (Math.PI / 180) * base * framed.zoom;
  assert.ok(Math.abs(framedPx - 300 * 0.7) < 1e-6, `${framedPx}`);
  const one = fitView({ crumbs: [{ lat: 0, lng: 0, t: 0 }], sounds: [] }, { w: 600, h: 400 });
  assert.ok(one.zoom < 300_000 && one.zoom > 10_000);
  assert.equal(fitView({ crumbs: [], sounds: [] }, { w: 1, h: 1 }), null);
});

test('timeline squeezes any walk into 12–30 s', () => {
  const tr = toTrace(derive);
  const tl = timeline(tr);
  assert.equal(tl.t0, 0);
  assert.equal(tl.t1, 40 * MIN);
  assert.equal(tl.playMs, 20_000); // 40 min / 120
  near(tl.speed, 120);
  assert.equal(timeline({ crumbs: [{ t: 0 }, { t: MIN }], sounds: [] }).playMs, TRACK_MIN_MS);
  assert.equal(timeline({ crumbs: [{ t: 0 }, { t: 5 * 3600_000 }], sounds: [] }).playMs, TRACK_MAX_MS);
});

test('at: interpolates between crumbs, clamps at both ends', () => {
  const tr = toTrace(derive);
  const mid = at(tr, 10.5 * MIN);
  assert.equal(mid.i, 10);
  near(mid.lat, 46.85 + 10.5 * 0.0002, 1e-12);
  near(mid.lng, 9.53 + 10.5 * 0.0003, 1e-12);
  assert.equal(at(tr, -5).i, 0);
  assert.equal(at(tr, 99 * MIN).i, 40);
  assert.equal(at({ crumbs: [], sounds: [] }, 0), null);
});

test('soundsUntil: the sounds the playhead has passed', () => {
  const tr = toTrace(derive);
  assert.deepEqual(soundsUntil(tr, 4 * MIN), []);
  assert.deepEqual(soundsUntil(tr, 20 * MIN).map((s) => s.id), ['r1', 'r2']);
});

test('playOrder: live walks first, a shared walk replaces its ended live trace', () => {
  const stored = (id, at) => ({ trace: { id, crumbs: [], sounds: [] }, at });
  const live = new Map([
    ['derive_9', { id: 'live:derive_9', sid: 'derive_9', live: true, seenAt: 5 }],
    ['derive_8', { id: 'live:derive_8', sid: 'derive_8', live: false, ended: true, seenAt: 9 }],
    ['derive_7', { id: 'live:derive_7', sid: 'derive_7', live: true, seenAt: 7 }],
  ]);
  let order = playOrder([stored('old', 1), stored('new', 2)], live).map((t) => t.id);
  assert.deepEqual(order, ['live:derive_7', 'live:derive_9', 'live:derive_8', 'new', 'old']);
  // derive_8 was shared at its end: the stored one takes its place
  order = playOrder([stored('old', 1), stored('derive_8', 3)], live).map((t) => t.id);
  assert.deepEqual(order, ['live:derive_7', 'live:derive_9', 'derive_8', 'old']);
  // while derive_9 is still being walked, an earlier share of it waits
  order = playOrder([stored('derive_9', 4)], live).map((t) => t.id);
  assert.deepEqual(order, ['live:derive_7', 'live:derive_9', 'live:derive_8']);
});

test('niceStep: round grid steps', () => {
  assert.equal(niceStep(6), 1);
  assert.equal(niceStep(0.012), 0.002);
  near(niceStep(0.0003), 0.00005, 1e-12);
});

test('boundsOf', () => {
  boundsOf(toTrace(derive)).forEach((v, i) => near(v, [9.53, 46.85, 9.542, 46.858][i], 1e-9));
});

// ── live walks on the wire ──────────────────────────────────────────────────

test('crumbs on the wire: rounded to ~1 m, bad ones dropped, capped', () => {
  assert.deepEqual(packCrumb({ lat: 46.8512345, lng: 9.5398765, timestamp: 12.4 }), [46.85123, 9.53988, 12]);
  const crumbs = unpackCrumbs([[46.85, 9.53, 1], [91, 0, 2], ['a', 0, 3], [46.86, 9.54]]);
  assert.deepEqual(crumbs, [{ lat: 46.85, lng: 9.53, t: 1 }]);
  const many = Array.from({ length: MAX_LIVE_CRUMBS + 10 }, (_, i) => [0, 0, i]);
  assert.equal(unpackCrumbs(many).length, MAX_LIVE_CRUMBS);
  assert.equal(unpackCrumbs(many)[0].t, 10); // the newest are kept
});

test('readWalkMessage refuses what is not a walk', () => {
  assert.equal(readWalkMessage('walk', null), null);
  assert.equal(readWalkMessage('walk', { sid: '../x' }), null);
  assert.equal(readWalkMessage('sound', { sid: 'a', lat: 'x', lng: 0 }), null);
  assert.equal(readWalkMessage('draft', { sid: 'a' }), null);
  const w = readWalkMessage('walk', { sid: 'derive_1', alias: 'x'.repeat(99), crumbs: [[1, 2, 3]] });
  assert.equal(w.alias.length, 40);
  assert.equal(w.full, false);
});

test('applyWalkMessage: batches append, full replaces, sounds once, end keeps the trace', () => {
  let live = new Map();
  const walk = (crumbs, full = false) => readWalkMessage('walk', { sid: 'derive_1', alias: 'ana', start: 0, crumbs, full });
  live = applyWalkMessage(live, walk([[1, 1, 1], [1, 1, 2]]), 'u1', 100);
  live = applyWalkMessage(live, walk([[1, 1, 2], [1, 1, 3]]), 'u1', 200);
  assert.deepEqual(live.get('derive_1').crumbs.map((c) => c.t), [1, 2, 3]);
  const sound = readWalkMessage('sound', { sid: 'derive_1', id: 'r1', lat: 1, lng: 1, t: 3, name: 'bells' });
  live = applyWalkMessage(live, sound, 'u1', 300);
  live = applyWalkMessage(live, sound, 'u1', 301);
  assert.equal(live.get('derive_1').sounds.length, 1);
  live = applyWalkMessage(live, walk([[2, 2, 9]], true), 'u1', 400);
  const tr = live.get('derive_1');
  assert.deepEqual(tr.crumbs.map((c) => c.t), [9]);
  assert.equal(tr.sounds.length, 1, 'a full trace keeps the sounds');
  assert.equal(tr.id, 'live:derive_1');
  live = applyWalkMessage(live, readWalkMessage('walk-end', { sid: 'derive_1' }), 'u1', 500);
  assert.equal(live.get('derive_1').live, false);
  assert.equal(live.get('derive_1').ended, true);
  // a sound for a walk nobody has seen yet is ignored
  const other = readWalkMessage('sound', { sid: 'derive_2', id: 'r', lat: 0, lng: 0 });
  assert.equal(applyWalkMessage(live, other, 'u2').has('derive_2'), false);
});
