/**
 * The splash (index.html) stays at least SPLASH_MS from the page's start, then
 * steps away; a tap, a click or a key lifts it sooner. Marks the app as started,
 * so index.html's "did not start" note never shows.
 */
const SPLASH_MS = 1400;

export function dismissSplash() {
  window.__afppStarted = true;
  const el = document.getElementById('splash');
  if (!el) return;
  let timer = null;
  const go = () => {
    clearTimeout(timer);
    el.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    el.classList.add('is-gone');
    setTimeout(() => el.remove(), 500);
  };
  el.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
  timer = setTimeout(go, Math.max(0, SPLASH_MS - performance.now()));
}
