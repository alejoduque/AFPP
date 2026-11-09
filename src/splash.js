/**
 * The splash (index.html): the logo and the supporters' credit stay SHOW_MS once drawn
 * (timed from when it arrives, not from the page's start, so a slow network
 * still sees it); if it has not come by MAX_WAIT_MS the splash steps away
 * anyway. A tap, a click or a key lifts it sooner (not a tap on a credit link:
 * that opens the link). Marks the app as started,
 * so index.html's "did not start" note never shows.
 */
const SHOW_MS = 5000;
const MAX_WAIT_MS = 4000;

function logoShown(img) {
  if (window.__splashLogoAt || !img || (img.complete && img.naturalWidth)) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, Math.max(0, MAX_WAIT_MS - performance.now()));
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
}

export function dismissSplash() {
  window.__afppStarted = true;
  const el = document.getElementById('splash');
  if (!el) return;
  let timer = null;
  let gone = false;
  const go = (e) => {
    if (gone || e?.target?.closest?.('a')) return;
    gone = true;
    clearTimeout(timer);
    el.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    el.classList.add('is-gone');
    setTimeout(() => el.remove(), 500);
  };
  el.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
  logoShown(el.querySelector('img')).then(() => {
    const from = window.__splashLogoAt ?? performance.now();
    timer = setTimeout(go, Math.max(0, from + SHOW_MS - performance.now()));
  });
}
