/**
 * Time Based Text on #AFPP lines (public/chat/afpp-assembly.js; after dyne's
 * TBT). A line may carry its typing as the IRCv3 client tag +altred.xyz/tbt:
 * base64url of JSON [[delay_ms, position, delete_count, inserted], …]. The
 * bitácora keeps it only when replaying it gives exactly the line, as KLAP's
 * replay_tbt checks before it stores a premise's typing.
 */
export const TBT_TAG = '+altred.xyz/tbt';
const MAX_ENTRIES = 2000;
const MAX_DELAY = 3_600_000;

/** IRCv3 tag values escape ; space \ CR LF. */
export function unescapeTag(v) {
  return v.replace(/\\(.)?/g, (_, c) => ({ ':': ';', s: ' ', '\\': '\\', r: '\r', n: '\n' })[c] ?? c ?? '');
}

/** "@a=1;+b=x" → {a: '1', '+b': 'x'} */
export function parseTags(raw) {
  const tags = {};
  for (const kv of raw.split(';')) {
    const eq = kv.indexOf('=');
    if (eq < 0) tags[kv] = '';
    else tags[kv.slice(0, eq)] = unescapeTag(kv.slice(eq + 1));
  }
  return tags;
}

export function replay(entries) {
  return entries.reduce((text, e) => text.slice(0, e[1]) + e[3] + text.slice(e[1] + e[2]), '');
}

/** The recording, if the tag decodes to one that types exactly `text`; else null. */
export function decodeTbt(value, text) {
  if (typeof value !== 'string' || !value || value.length > 4096) return null;
  let entries;
  try {
    entries = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const ok = Array.isArray(entries) && entries.length > 0 && entries.length <= MAX_ENTRIES && entries.every((e) =>
    Array.isArray(e) && e.length === 4 &&
    Number.isInteger(e[0]) && e[0] >= 0 && e[0] <= MAX_DELAY &&
    Number.isInteger(e[1]) && e[1] >= 0 && Number.isInteger(e[2]) && e[2] >= 0 && typeof e[3] === 'string');
  if (!ok) return null;
  try {
    return replay(entries) === text ? entries : null;
  } catch {
    return null;
  }
}
