/**
 * Live walks: walkers stream their derive, as they walk, to everyone looking
 * at the AFPP globe. Over the chat's room relay (KLAP's chatb relay), in a room
 * of its own, 'afpp:walks', broadcast only: no WebRTC here, so any number of
 * people can watch without each one adding to anybody's mesh. Live sound goes
 * through the chat's assembly room instead (src/perma/liveWalk.js).
 *
 * Messages (data is a JSON string, as in chatb):
 *   walk       {sid, alias, title, start, crumbs: [[lat, lng, t], …], full}
 *              a batch every few seconds; full = the whole trace so far,
 *              sent when someone new comes in
 *   sound      {sid, id, lat, lng, t, name, duration}
 *   walk-end   {sid, deriveId}   deriveId when the walker shared it at the end
 *
 * Nothing is kept: the relay forgets everything when the room empties. What
 * stays on the map is only what a walker shares afterwards, as before.
 */

export const WALKS_ROOM = 'afpp:walks';
/** The chat's assembly room (public/chat/afpp-assembly.js names it the same way). */
export const ASSEMBLY_ROOM = 'afpp:#afpp';
export const MAX_LIVE_CRUMBS = 1200; // under the relay's 64 KB per message

const round5 = (v) => Math.round(v * 1e5) / 1e5;
const isLat = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90;
const isLng = (v) => typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const SID_RE = /^[A-Za-z0-9_.-]{1,100}$/;

/** [lat, lng, t] for the wire, rounded to ~1 m like the server's store. */
export const packCrumb = (c) => [round5(c.lat), round5(c.lng), Math.round(c.t ?? c.timestamp ?? Date.now())];

export function unpackCrumbs(list) {
  return (Array.isArray(list) ? list : [])
    .filter((c) => Array.isArray(c) && isLat(c[0]) && isLng(c[1]) && Number.isFinite(c[2]))
    .slice(-MAX_LIVE_CRUMBS)
    .map((c) => ({ lat: round5(c[0]), lng: round5(c[1]), t: c[2] }));
}

/** Validate a received message; null when it is not one of ours. */
export function readWalkMessage(type, data) {
  if (!data || typeof data !== 'object' || !SID_RE.test(String(data.sid))) return null;
  const sid = String(data.sid);
  if (type === 'walk') {
    return {
      type, sid, full: !!data.full,
      alias: str(data.alias, 40) || 'anon',
      title: str(data.title, 120),
      start: Number.isFinite(data.start) ? data.start : null,
      crumbs: unpackCrumbs(data.crumbs),
    };
  }
  if (type === 'sound') {
    if (!isLat(data.lat) || !isLng(data.lng)) return null;
    return {
      type, sid,
      sound: {
        id: str(String(data.id), 100),
        lat: round5(data.lat),
        lng: round5(data.lng),
        t: Number.isFinite(data.t) ? data.t : Date.now(),
        name: str(data.name, 120),
        duration: Number.isFinite(data.duration) ? Math.max(0, data.duration) : 0,
        audio: null,
      },
    };
  }
  if (type === 'walk-end') {
    return { type, sid, deriveId: SID_RE.test(String(data.deriveId)) ? String(data.deriveId) : null };
  }
  return null;
}

/**
 * Merge one message into the map of live traces (sid → trace), returning a new
 * Map. A trace has the shape tracklog.js plays: {id, alias, title, live,
 * crumbs, sounds, from, seenAt, ended, deriveId}.
 */
export function applyWalkMessage(live, msg, from, now = Date.now()) {
  const next = new Map(live);
  const old = next.get(msg.sid);
  if (msg.type === 'walk') {
    const crumbs = msg.full || !old ? msg.crumbs : mergeCrumbs(old.crumbs, msg.crumbs);
    next.set(msg.sid, {
      id: `live:${msg.sid}`,
      sid: msg.sid,
      alias: msg.alias,
      title: msg.title,
      live: true,
      start: msg.start ?? old?.start ?? crumbs[0]?.t ?? now,
      crumbs,
      sounds: old?.sounds || [],
      from,
      seenAt: now,
      ended: false,
      deriveId: null,
    });
  } else if (msg.type === 'sound' && old) {
    if (!old.sounds.some((s) => s.id === msg.sound.id)) {
      next.set(msg.sid, { ...old, sounds: [...old.sounds, msg.sound], seenAt: now });
    }
  } else if (msg.type === 'walk-end' && old) {
    next.set(msg.sid, { ...old, live: false, ended: true, deriveId: msg.deriveId, seenAt: now });
  }
  return next;
}

function mergeCrumbs(old, add) {
  const last = old.length ? old[old.length - 1].t : -Infinity;
  const merged = old.concat(add.filter((c) => c.t > last));
  return merged.length > MAX_LIVE_CRUMBS ? merged.slice(-MAX_LIVE_CRUMBS) : merged;
}

/**
 * A chatb room client without WebRTC: join, broadcast, hear the others.
 * on(type, fn(from, data)); 'users' fn(users, joinedIds, leftIds); 'status' fn(state).
 */
export class RelayRoom {
  constructor({ url, room, nick = '' }) {
    this.url = url;
    this.room = room;
    this.nick = nick;
    this.id = null;
    this.users = {};
    this.handlers = {};
    this.retry = 1000;
    this.closed = false;
    this.ws = null;
  }

  on(type, fn) {
    (this.handlers[type] = this.handlers[type] || []).push(fn);
    return this;
  }

  emit(type, ...args) {
    (this.handlers[type] || []).forEach((fn) => fn(...args));
  }

  connect() {
    if (this.closed) return;
    let ws;
    try {
      ws = this.ws = new WebSocket(this.url);
    } catch {
      this.emit('status', 'offline');
      return;
    }
    this.emit('status', 'connecting');
    ws.onopen = () => {
      this.retry = 1000;
    };
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'init') {
        this.id = String(msg.data);
        this.command('nick', this.nick);
        this.command('join', this.room);
        this.emit('status', 'live');
        return;
      }
      if (msg.type === 'info') {
        let users = {};
        try {
          users = JSON.parse(msg.data).users || {};
        } catch {
          // keep none
        }
        this.updateUsers(users);
        return;
      }
      let data = null;
      try {
        data = msg.data ? JSON.parse(msg.data) : null;
      } catch {
        return;
      }
      this.emit(msg.type, String(msg.from), data);
    };
    ws.onclose = () => {
      this.id = null;
      this.updateUsers({});
      this.emit('status', 'offline');
      if (this.closed) return;
      this.timer = setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(this.retry * 2, 30000);
    };
  }

  updateUsers(users) {
    const joined = Object.keys(users).filter((id) => id !== this.id && !this.users[id]);
    const left = Object.keys(this.users).filter((id) => !users[id]);
    this.users = users;
    this.emit('users', users, joined, left);
  }

  isOpen() {
    return this.ws && this.ws.readyState === 1 && this.id;
  }

  raw(message) {
    if (this.isOpen()) this.ws.send(JSON.stringify(message));
  }

  command(action, data) {
    this.raw({ type: 'cmd', data: JSON.stringify({ action, data }) });
  }

  broadcast(type, data) {
    this.raw({ type, data: JSON.stringify(data) });
  }

  sendTo(id, type, data) {
    this.raw({ type, to: id, data: JSON.stringify(data) });
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }
}

/**
 * Watch the live walks: onChange(Map sid → trace) whenever one moves, gains a
 * sound, ends or goes quiet. A walker whose connection is gone for good is
 * dropped after STALE_MS. Returns a close function.
 */
const STALE_MS = 5 * 60_000;
const ENDED_MS = 90_000; // an ended walk lingers, for its shared version to replace it

export function watchWalks(url, onChange) {
  if (!url || typeof WebSocket === 'undefined') return () => {};
  let live = new Map();
  const room = new RelayRoom({ url, room: WALKS_ROOM, nick: 'watch' });
  const set = (next) => {
    live = next;
    onChange(live);
  };
  ['walk', 'sound', 'walk-end'].forEach((type) =>
    room.on(type, (from, data) => {
      const msg = readWalkMessage(type, data);
      if (msg) set(applyWalkMessage(live, msg, from));
    }),
  );
  const sweep = setInterval(() => {
    const now = Date.now();
    let changed = false;
    const next = new Map(live);
    for (const [sid, tr] of live) {
      const gone = !room.users[tr.from];
      if ((tr.ended && now - tr.seenAt > ENDED_MS) || (gone && now - tr.seenAt > STALE_MS)) {
        next.delete(sid);
        changed = true;
      }
    }
    if (changed) set(next);
  }, 15_000);
  room.connect();
  return () => {
    clearInterval(sweep);
    room.close();
  };
}
