import test from 'node:test';
import assert from 'node:assert/strict';
import { matches, solarHour, daypartOf, cleanSelection, activeCount, emptySelection, knownTags } from '../layers.mjs';

const NOW = Date.UTC(2026, 10, 9, 12, 0);
const rec = (tags, iso, lng = 0) => ({ tags, timestamp: Date.parse(iso), lng });

test('nothing ticked lets everything through', () => {
  assert.equal(matches(rec([], '2020-01-01T00:00:00Z'), emptySelection(), NOW), true);
  assert.equal(activeCount(emptySelection()), 0);
});

test('soundscape boxes are OR within the group', () => {
  const sel = { soundscape: ['biophony', 'geophony'] };
  assert.equal(matches(rec(['biophony'], '2026-11-09T06:00:00Z'), sel, NOW), true);
  assert.equal(matches(rec(['geophony'], '2026-11-09T06:00:00Z'), sel, NOW), true);
  assert.equal(matches(rec(['anthropophony'], '2026-11-09T06:00:00Z'), sel, NOW), false);
  assert.equal(matches(rec([], '2026-11-09T06:00:00Z'), sel, NOW), false);
});

test('untagged keeps sounds with no soundscape tag', () => {
  const sel = { soundscape: ['untagged'] };
  assert.equal(matches(rec([], '2026-11-09T06:00:00Z'), sel, NOW), true);
  assert.equal(matches(rec(['voice'], '2026-11-09T06:00:00Z'), sel, NOW), true);
  assert.equal(matches(rec(['biophony'], '2026-11-09T06:00:00Z'), sel, NOW), false);
});

test('groups are AND between them', () => {
  const sel = { soundscape: ['biophony'], content: ['animal'] };
  assert.equal(matches(rec(['biophony', 'animal'], '2026-11-09T06:00:00Z'), sel, NOW), true);
  assert.equal(matches(rec(['biophony', 'voice'], '2026-11-09T06:00:00Z'), sel, NOW), false);
});

test('tags are matched case-insensitively and unknown ones ignored', () => {
  assert.deepEqual(knownTags(['Biophony', 'frog', 'VOICE']), ['biophony', 'voice']);
  assert.equal(matches(rec(['Animal'], '2026-11-09T06:00:00Z'), { content: ['animal'] }, NOW), true);
});

test('solar hour follows longitude', () => {
  const t = Date.UTC(2026, 10, 9, 12, 0);
  assert.equal(solarHour(t, 0), 12);
  assert.equal(solarHour(t, -75), 7); // Colombia: 12 UTC is 7 local solar
  assert.equal(solarHour(t, 150), 22);
  assert.equal(solarHour(Date.UTC(2026, 10, 9, 2, 0), -45), 23);
});

test('dayparts', () => {
  assert.equal(daypartOf(5), 'dawn');
  assert.equal(daypartOf(7.99), 'dawn');
  assert.equal(daypartOf(8), 'day');
  assert.equal(daypartOf(17), 'dusk');
  assert.equal(daypartOf(20), 'night');
  assert.equal(daypartOf(3), 'night');
});

test('daypart filter uses the place, not UTC', () => {
  // 11:00 UTC at lng -75 is ~6:00 local: dawn
  const r = rec(['biophony'], '2026-11-09T11:00:00Z', -75);
  assert.equal(matches(r, { daypart: ['dawn'] }, NOW), true);
  assert.equal(matches(r, { daypart: ['day'] }, NOW), false);
});

test('since', () => {
  assert.equal(matches(rec([], '2026-11-09T01:00:00Z'), { since: '24h' }, NOW), true);
  assert.equal(matches(rec([], '2026-11-07T01:00:00Z'), { since: '24h' }, NOW), false);
  assert.equal(matches(rec([], '2026-11-07T01:00:00Z'), { since: '7d' }, NOW), true);
  assert.equal(matches({ tags: [] }, { since: '7d' }, NOW), false);
});

test('a stored selection is cleaned', () => {
  assert.deepEqual(cleanSelection({ soundscape: ['biophony', 'x'], since: 'forever', daypart: 'dawn', telegram: false }), {
    soundscape: ['biophony'],
    content: [],
    daypart: [],
    since: 'any',
    telegram: false,
  });
  assert.deepEqual(cleanSelection(null), emptySelection());
  assert.equal(activeCount({ soundscape: ['biophony'], since: '7d' }), 2);
});
