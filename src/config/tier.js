/**
 * Build-time tier configuration (free vs paid Play Store listings).
 *
 * The tier is baked in at build time via VITE_APP_TIER:
 *   VITE_APP_TIER=free npm run build   → free listing (com.soundwalk.recorder.free)
 *   npm run build                      → paid listing (com.soundwalk.recorder), also the dev default
 *
 * Free tier: maps up to MAX_RECORDINGS recorded sounds, ZIP export/import locked.
 * Paid tier: unlimited recordings, all features.
 */

// __SOUNDWALK_IS_FREE__ / __SOUNDWALK_TIER__ are injected by vite.config.js
// `define`, so the built bundle contains only the active tier's marker
// string — build_release.sh greps for it to guarantee the right tier ships.
export const IS_FREE = __SOUNDWALK_IS_FREE__;
export const BUILD_TIER = __SOUNDWALK_TIER__;

// Side effect keeps the marker from being tree-shaken out of the bundle
// and makes the shipped tier inspectable at runtime.
if (typeof window !== 'undefined') {
  window.__SOUNDWALK_BUILD_TIER__ = BUILD_TIER;
}

export const MAX_RECORDINGS = IS_FREE ? 5 : Infinity;

export const FEATURES = {
  zipExport: !IS_FREE,
  zipImport: !IS_FREE,
};

const PAID_APP_ID = 'com.soundwalk.recorder';
export const PAID_LISTING_URL = `https://play.google.com/store/apps/details?id=${PAID_APP_ID}`;
const PAID_MARKET_URL = `market://details?id=${PAID_APP_ID}`;

/** Open the paid listing — Play Store app if available, browser otherwise. */
export function openPaidListing() {
  try {
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()) {
      window.open(PAID_MARKET_URL, '_system');
      return;
    }
  } catch (e) {
    // fall through to the web URL
  }
  window.open(PAID_LISTING_URL, '_blank', 'noopener');
}
