/**
 * ◍ live: the derive streamed while it is walked, for everyone on the AFPP site.
 *
 * The trace and the sounds' names go to the 'afpp:walks' room (src/afpp/walks.mjs),
 * where the globe turns into a tracklog that follows the walker. With "live
 * sound" the walker also joins the chat's assembly room with the microphone
 * only (KLAP's room.js: a WebRTC mesh), and the people in #AFPP hear the walk.
 * While the microphone is shared this way, takes are recorded from that same
 * stream (recorder.js setSharedStream), so only one thing ever holds the mic.
 *
 * Opt-in per derive, after consent. Nothing is stored anywhere: the relay
 * forgets the walk when it ends. sid = the id the derive gets if it is shared
 * afterwards, so viewers swap the live trace for the stored one in place.
 */
import { AFPP_API, roomsUrl } from '../config/afpp.js';
import { RelayRoom, WALKS_ROOM, ASSEMBLY_ROOM, MAX_LIVE_CRUMBS, packCrumb } from '../afpp/walks.mjs';
import { loadAssembly } from '../afpp/assembly.js';
import { setSharedStream } from './recorder.js';

const BATCH_MS = 3000;
const MIN_STEP_M = 3;
const MIN_GAP_MS = 10_000;

function metres(a, b) {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6_371_000;
}

/** Every other point until it fits: the shape survives, the message stays small. */
function thin(crumbs, max) {
  let list = crumbs;
  while (list.length > max) list = list.filter((_, i) => i % 2 === 0 || i === list.length - 1);
  return list;
}

async function iceServers() {
  try {
    const res = await fetch(`${AFPP_API}/api/ice`);
    return (await res.json()).iceServers || [];
  } catch {
    return [];
  }
}

/** Leave a room.js Room for good (it has no close: it reconnects by design). */
function leave(room) {
  if (room.ws) {
    room.ws.onclose = null;
    room.ws.close();
  }
  Object.keys(room.peers).forEach((id) => room.peers[id].close());
  room.peers = {};
}

export class LiveWalk {
  /** session: the active walkSessionService session; sid: its future derive id. */
  constructor({ sid, alias, title = '', start, onStatus = () => {} }) {
    this.sid = sid;
    this.alias = alias || 'anon';
    this.title = title;
    this.start = start || Date.now();
    this.onStatus = onStatus;
    this.crumbs = [];
    this.pending = [];
    this.voice = null; // {room, stream}
    this.relay = new RelayRoom({ url: roomsUrl(), room: WALKS_ROOM, nick: this.alias });
    this.relay.on('status', (s) => {
      if (s === 'live') this.sendFull();
      this.onStatus(s);
    });
    this.relay.on('users', (users, joined) => {
      if (joined.length) this.sendFull(); // someone came to watch
    });
    this.timer = setInterval(() => this.flush(), BATCH_MS);
    this.relay.connect();
  }

  head() {
    return { sid: this.sid, alias: this.alias, title: this.title, start: this.start };
  }

  /** A GPS fix: kept when it moved a few metres, or now and then when standing. */
  feed(pos) {
    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) return;
    const c = { lat: pos.lat, lng: pos.lng, t: pos.timestamp || Date.now() };
    const last = this.crumbs[this.crumbs.length - 1];
    if (last && metres(last, c) < MIN_STEP_M && c.t - last.t < MIN_GAP_MS) return;
    if (last && c.t <= last.t) return;
    this.crumbs.push(c);
    if (this.crumbs.length > MAX_LIVE_CRUMBS * 4) this.crumbs = thin(this.crumbs, MAX_LIVE_CRUMBS * 2);
    this.pending.push(c);
  }

  flush() {
    if (!this.pending.length) return;
    this.relay.broadcast('walk', { ...this.head(), full: false, crumbs: this.pending.map(packCrumb) });
    this.pending = [];
  }

  sendFull() {
    this.pending = [];
    this.relay.broadcast('walk', { ...this.head(), full: true, crumbs: thin(this.crumbs, MAX_LIVE_CRUMBS).map(packCrumb) });
  }

  /** A saved take (useField's recording metadata). */
  sound(meta) {
    if (!meta?.location) return;
    this.flush();
    this.relay.broadcast('sound', {
      sid: this.sid,
      id: meta.uniqueId,
      lat: meta.location.lat,
      lng: meta.location.lng,
      t: Date.parse(meta.timestamp) || Date.now(),
      name: meta.displayName || '',
      duration: meta.duration || 0,
    });
  }

  /** The microphone, live, to the people in the chat. Resolves once it is on. */
  async setVoice(on) {
    if (!on) {
      if (!this.voice) return;
      const { room, stream } = this.voice;
      this.voice = null;
      setSharedStream(null);
      room.setTrack('audio', null);
      stream.getTracks().forEach((t) => t.stop());
      leave(room);
      return;
    }
    if (this.voice) return;
    const [assembly, ice, stream] = await Promise.all([
      loadAssembly(['room']),
      iceServers(),
      // field sound, not a call: no echo cancelling, no gating, no gain riding
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }),
    ]);
    const room = new assembly.Room({ room: ASSEMBLY_ROOM, wsUrl: roomsUrl(), iceServers: ice, nick: this.alias });
    const state = () => room.broadcast('state', { name: this.alias, mic: true, cam: 'off', walking: this.sid });
    room.on('status', (s) => s === 'live' && state());
    room.on('users', (users, joined) => joined.length && state());
    room.setTrack('audio', stream.getAudioTracks()[0]);
    setSharedStream(stream);
    room.connect();
    this.voice = { room, stream };
  }

  /** The derive ended. */
  end() {
    this.flush();
    this.relay.broadcast('walk-end', { sid: this.sid });
    this.stop();
  }

  stop() {
    clearInterval(this.timer);
    this.setVoice(false);
    // give the last message a moment to leave before the socket closes
    setTimeout(() => this.relay.close(), 500);
  }
}
