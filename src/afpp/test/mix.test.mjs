import test from 'node:test';
import assert from 'node:assert/strict';
import { CENTER, SONAR_R, PARK_R, mixAt, parkAt, clampToStage, describePan } from '../mix.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('the centre is full volume and balanced', () => {
  const m = mixAt(CENTER, CENTER);
  assert.equal(m.inside, true);
  near(m.gain, 1);
  near(m.pan, 0);
});

test('volume falls towards the rim and is silent at and beyond it', () => {
  const half = mixAt(CENTER, CENTER + SONAR_R / 2);
  assert.ok(half.gain > 0.5 && half.gain < 1);
  near(half.pan, 0);
  const rim = mixAt(CENTER + SONAR_R, CENTER);
  assert.equal(rim.inside, false);
  assert.equal(rim.gain, 0);
  assert.equal(mixAt(0.01, 0.01).gain, 0);
});

test('left of centre pans left, right pans right, proportionally', () => {
  const l = mixAt(CENTER - SONAR_R * 0.6, CENTER);
  const r = mixAt(CENTER + SONAR_R * 0.3, CENTER);
  near(l.pan, -0.6);
  near(r.pan, 0.3);
  assert.ok(r.gain > l.gain);
});

test('gain decreases monotonically with distance', () => {
  let prev = 2;
  for (let k = 0; k <= 10; k++) {
    const g = mixAt(CENTER + (SONAR_R * k) / 10.5, CENTER).gain;
    assert.ok(g < prev);
    prev = g;
  }
});

test('parking spots sit outside the sonar, on the stage, and apart', () => {
  for (const n of [1, 3, 8, 12]) {
    const spots = Array.from({ length: n }, (_, i) => parkAt(i, n));
    for (const s of spots) {
      assert.equal(mixAt(s.x, s.y).inside, false);
      assert.ok(s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) > 0.2 * PARK_R);
    }
  }
  near(parkAt(0, 4).x, CENTER); // first one at the top
});

test('clampToStage and describePan', () => {
  assert.deepEqual(clampToStage(-1, 2), { x: 0.03, y: 0.97 });
  assert.equal(describePan(0.01), 'centro');
  assert.equal(describePan(-0.3), 'izq 30 %');
  assert.equal(describePan(0.5), 'der 50 %');
});
