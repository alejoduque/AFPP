/**
 * AFPP — the shared global map. The API is the self-hosted server in
 * server/afpp/; set VITE_AFPP_API at build time (e.g. https://altred.xyz/AlpineFeministPunkParade/afpp).
 * Unset → sharing and the global map are hidden; the app stays fully offline.
 */
export const AFPP_API = String(import.meta.env.VITE_AFPP_API || '').replace(/\/+$/, '');
export const AFPP_ENABLED = Boolean(AFPP_API);

/**
 * The room relay for the chat's assembly and live walks (KLAP's chatb relay,
 * server/afpp/deploy/realtime-on-server.sh): a ws(s):// URL, or a path on
 * this site ('/afpp/_rooms' with the dev proxy in vite.config.js). Unset →
 * no live typing, voices or live walks; the IRC chat and TBT lines still work.
 */
const ROOMS = String(import.meta.env.VITE_AFPP_ROOMS || '').trim();
export const AFPP_ROOMS_ENABLED = Boolean(ROOMS && AFPP_API);
export function roomsUrl() {
  if (!AFPP_ROOMS_ENABLED) return null;
  if (/^wss?:\/\//.test(ROOMS)) return ROOMS;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${ROOMS.startsWith('/') ? '' : '/'}${ROOMS}`;
}
