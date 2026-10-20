/**
 * Ported unchanged from iScream's Mestizaje (www/mestizaje/js/mix.mjs).
 *
 * The analogy at the heart of Mestizaje, as pure functions (tested in
 * test/mix.test.mjs). Positions are in stage units: the stage is a square
 * from 0 to 1 on both axes, the sonar is centred at (0.5, 0.5).
 *
 *   centre of the sonar  → full volume, balanced L/R
 *   towards the rim      → quieter (silent at the rim)
 *   left / right of it   → panned left / right
 *   outside the sonar    → not in the mix at all
 *
 * Not spatial audio — just a gesture everyone understands.
 */

export const CENTER = 0.5;
/** Radius of the sonar circle. */
export const SONAR_R = 0.39;
/** Radius of the ring where streams wait outside the sonar. */
export const PARK_R = 0.465;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {number} x stage units
 * @param {number} y stage units
 * @returns {{inside: boolean, distance: number, gain: number, pan: number}}
 *   distance: 0 at the centre, 1 at the rim (more outside it)
 */
export function mixAt(x, y) {
  const dx = (x - CENTER) / SONAR_R;
  const dy = (y - CENTER) / SONAR_R;
  const distance = Math.hypot(dx, dy);
  const inside = distance < 1;
  if (!inside) return { inside, distance, gain: 0, pan: 0 };
  // cos keeps the centre broad and falls away smoothly to nothing at the rim.
  const gain = Math.cos((distance * Math.PI) / 2);
  const pan = clamp(dx, -1, 1);
  return { inside, distance, gain, pan };
}

/**
 * Where the i-th of n waiting streams sits: evenly spaced on the parking
 * ring, starting at the top and going clockwise.
 */
export function parkAt(i, n) {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
  return { x: CENTER + PARK_R * Math.cos(a), y: CENTER + PARK_R * Math.sin(a) };
}

/** Keep a dragged point on the stage. */
export function clampToStage(x, y, margin = 0.03) {
  return { x: clamp(x, margin, 1 - margin), y: clamp(y, margin, 1 - margin) };
}

/** "izq 30 %" / "der 12 %" / "centro" for the text list and aria labels. */
export function describePan(pan) {
  const pct = Math.round(Math.abs(pan) * 100);
  if (pct < 5) return 'centro';
  return (pan < 0 ? 'izq ' : 'der ') + pct + ' %';
}
