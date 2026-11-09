/**
 * Sound metadata and the Layers filter. Pure; test/layers.test.mjs.
 *
 * A recording carries tags (the server keeps up to 10). The take sheet offers
 * these as checkboxes, so nobody has to type on a phone:
 *
 *   soundscape   geophony · biophony · anthropophony   (Krause's three sources)
 *   in it        voice · animal · story · humans · species
 *
 * Date and hour need no tag: they come from the recording's timestamp. The
 * hour is the place's local solar hour (UTC + longitude / 15), so a dawn chorus
 * recorded anywhere reads as dawn without a time-zone database.
 *
 * The Layers window picks which sounds may feed the rings. Within a group the
 * boxes are OR (biophony or geophony); between groups AND (biophony, and at
 * night); a group with nothing ticked does not filter.
 */

export const SOUNDSCAPE = ['geophony', 'biophony', 'anthropophony'];
export const CONTENT = ['voice', 'animal', 'story', 'humans', 'species'];
export const TAGS = [...SOUNDSCAPE, ...CONTENT];
export const DAYPARTS = ['dawn', 'day', 'dusk', 'night'];
export const SINCE = ['any', '24h', '7d', '30d'];
export const UNTAGGED = 'untagged';

const SINCE_MS = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };

/** An empty selection: everything passes. */
export function emptySelection() {
  return { soundscape: [], content: [], daypart: [], since: 'any', telegram: true };
}

/** Make a stored selection safe to use (unknown keys dropped, defaults filled). */
export function cleanSelection(sel) {
  const e = emptySelection();
  if (!sel || typeof sel !== 'object') return e;
  const pick = (list, allowed) => (Array.isArray(list) ? list.filter((v) => allowed.includes(v)) : []);
  return {
    soundscape: pick(sel.soundscape, [...SOUNDSCAPE, UNTAGGED]),
    content: pick(sel.content, CONTENT),
    daypart: pick(sel.daypart, DAYPARTS),
    since: SINCE.includes(sel.since) ? sel.since : 'any',
    telegram: sel.telegram !== false,
  };
}

/** How many boxes are ticked (0 = no filter). */
export function activeCount(sel) {
  const s = cleanSelection(sel);
  return s.soundscape.length + s.content.length + s.daypart.length + (s.since !== 'any' ? 1 : 0);
}

/** The tags a recording carries, lower-cased, only the known ones. */
export function knownTags(tags) {
  return (Array.isArray(tags) ? tags : []).map((t) => String(t).toLowerCase()).filter((t) => TAGS.includes(t));
}

/** Local solar hour 0..24 at longitude lng for time t (ms). */
export function solarHour(t, lng) {
  const d = new Date(t);
  const utc = d.getUTCHours() + d.getUTCMinutes() / 60;
  return (((utc + (Number(lng) || 0) / 15) % 24) + 24) % 24;
}

export function daypartOf(hour) {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/**
 * Does a sound pass the selection?
 * @param {{tags?: string[], timestamp?: number|string, lng?: number}} rec
 * @param {object} sel
 * @param {number} now ms
 */
export function matches(rec, sel, now = Date.now()) {
  const s = cleanSelection(sel);
  const tags = knownTags(rec?.tags);
  if (s.soundscape.length) {
    const scape = tags.filter((t) => SOUNDSCAPE.includes(t));
    const ok = s.soundscape.some((v) => (v === UNTAGGED ? scape.length === 0 : scape.includes(v)));
    if (!ok) return false;
  }
  if (s.content.length && !s.content.some((v) => tags.includes(v))) return false;
  const t = typeof rec?.timestamp === 'number' ? rec.timestamp : Date.parse(rec?.timestamp);
  if (s.daypart.length) {
    if (!Number.isFinite(t)) return false;
    if (!s.daypart.includes(daypartOf(solarHour(t, rec.lng)))) return false;
  }
  if (s.since !== 'any') {
    if (!Number.isFinite(t) || now - t > SINCE_MS[s.since]) return false;
  }
  return true;
}
