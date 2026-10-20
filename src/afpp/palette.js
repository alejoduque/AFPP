/**
 * AFPP's three tones, permacomputing-style: every pixel is one of them.
 *   ground — black, the night side
 *   ink    — purple, everything that is there
 *   lit    — white, whatever is active: a fresh derive, a sound you hear
 * Keep in sync with the CSS variables in theme.css.
 */
export const GROUND = '#000000';
export const INK = '#9b4dff';
export const LIT = '#ffffff';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const GROUND_RGB = rgb(GROUND);
export const INK_RGB = rgb(INK);
export const LIT_RGB = rgb(LIT);
