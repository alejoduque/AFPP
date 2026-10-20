/**
 * Read side of the AFPP API, for the planet, the street map and the rings.
 * The write side (publishing a derive from the phone) is in
 * src/services/afppShareService.js.
 */
import { AFPP_API } from '../config/afpp.js';

async function get(path) {
  const res = await fetch(`${AFPP_API}/api/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** One dot per shared derive: {id, alias, title, lat, lng, lastAt, n}. */
export const fetchActivity = () => get('activity');

/** Shared derives whose bounds touch [w, s, e, n], with traces and recordings. */
export const fetchDerives = ([w, s, e, n]) =>
  get(`derives?bbox=${[w, s, e, n].map((v) => v.toFixed(5)).join(',')}`);

/** One shared derive, with its trace and recordings (for the tracklog). */
export const fetchDerive = (id) => get(`derives/${encodeURIComponent(id)}`);

/** Absolute URL of a recording's audio from its API-relative path. */
export const audioUrl = (rel) => (rel ? `${AFPP_API}/api/${rel}` : null);

/**
 * Live changes: onDerive(activityDot) when a derive is published or gets
 * audio, onRemove({id}) when one is unshared. Returns a close function.
 */
export function subscribe({ onDerive, onRemove }) {
  if (typeof EventSource === 'undefined') return () => {};
  const es = new EventSource(`${AFPP_API}/api/events`);
  es.addEventListener('derive', (e) => onDerive?.(JSON.parse(e.data)));
  es.addEventListener('remove', (e) => onRemove?.(JSON.parse(e.data)));
  return () => es.close();
}
