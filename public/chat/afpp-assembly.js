/*
 * The assembly in #AFPP: what IRC cannot carry, next to what it does.
 *
 * IRC keeps what was said: every line still goes to #AFPP as a plain PRIVMSG,
 * so IRC clients, the Telegram group and the bitácora lose nothing. This adds
 * how it was said and who is here, with KLAP's assembly scripts (assembly/,
 * shared byte for byte with the Klimat Action Protocol):
 *
 *  - Time Based Text (assembly/tbt.js, after dyne's TBT): each line carries
 *    its typing as an IRCv3 client tag, +altred.xyz/tbt, that other clients
 *    ignore; here it plays back at the pace it was written. Needs nothing
 *    but Ergo's message-tags.
 *  - With a room relay (data-rooms on #chat-join, KLAP's chatb relay):
 *    the others' lines appear while they are being typed ("> ana writes ::"),
 *    and a strip of people with voice, video and ascii video over a WebRTC
 *    mesh (assembly/room.js, presence.js, ascii.js).
 *
 * afpp-chat.js stays an IRC client: it calls window.chatHooks.onState, .tbt
 * and .replay, and knows nothing of what they do. Without this file (or
 * without tbt.js) the chat works exactly as before.
 */
(function () {
  'use strict';

  var assembly = window.arguman && window.arguman.assembly;
  if (!assembly || !assembly.tbt) return;
  var tbt = assembly.tbt;

  var $ = function (id) { return document.getElementById(id); };
  var joinForm = $('chat-join');
  var log = $('chat-log');
  var input = $('chat-input');
  var strip = $('chat-strip');
  var CHANNEL = (joinForm.getAttribute('data-channel') || '#AFPP').toLowerCase();
  var ROOMS = joinForm.getAttribute('data-rooms');
  var ICE = joinForm.getAttribute('data-ice');

  var TAG = '+altred.xyz/tbt';
  var MAX_TAG = 3800;      // Ergo allows 4094 bytes of client tags per line
  var MAX_ENTRIES = 2000;
  var MAX_PAUSE = 2500;    // a hesitation reads as one, not as a frozen line
  var MAX_REPLAY = 8000;   // a long line plays faster, never longer than this
  var STREAM_EVERY = 120;  // ms between typing updates to the room
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var STR = {
    present: 'here', settings: 'voice · camera', onlyYou: 'only you', hereN: '{c} here',
    roomOffline: 'offline :: the chat still works, without voices or live typing', roomConnecting: 'connecting…',
    enableSound: 'enable sound', micOn: 'mic on', micOff: 'mic off', muted: 'muted', you: '(you)',
    camOff: 'no camera', camAscii: 'ascii', camVideo: 'video', asciiAll: 'show all video as ascii',
    asciiNote: 'Ascii sends only text. Your camera image stays on your computer.',
    noPermission: 'The browser cannot use the device. Give permission in the browser settings.',
    noDevice: 'No device ({e}). Camera and microphone need https.',
    writes: '{n} writes ::', writing: 'writing…', walking: '◍ walking, live'
  };
  function S(key, vars) {
    var src = (window.AFPP_CHAT_STRINGS && window.AFPP_CHAT_STRINGS[key]) || STR[key] || key;
    return src.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }

  // ------------------------------------------------------------ TBT over IRC

  function toBase64Url(text) {
    var bytes = new TextEncoder().encode(text), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(value) {
    var b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function validEntries(entries) {
    return Array.isArray(entries) && entries.length <= MAX_ENTRIES && entries.every(function (e) {
      return Array.isArray(e) && e.length === 4 && e[0] >= 0 && e[1] >= 0 && e[2] >= 0 &&
        typeof e[3] === 'string';
    });
  }

  var recorder = new tbt.Recorder();
  var seq = 0;
  var sentTo = '';     // the text the room last saw
  input.addEventListener('input', function () { recorder.update(input.value); });

  var hooks = window.chatHooks = window.chatHooks || {};

  /**
   * The line about to be sent: its typing as a client tag ("key=value"), or
   * null when there is none or it would not fit. Either way the recording
   * starts again, and the others' ghost of this line goes.
   */
  hooks.tbt = function (text) {
    var tag = null;
    if (text) {
      recorder.update(text); // the sent text is trimmed
      var entries = recorder.recording();
      if (entries.length > 1 && entries.length <= MAX_ENTRIES && tbt.replay(entries) === text) {
        entries[0] = [0].concat(entries[0].slice(1)); // the wait before the first key is not part of the line
        var value = toBase64Url(JSON.stringify(entries));
        if (value.length <= MAX_TAG) tag = TAG + '=' + value;
      }
    }
    recorder.reset('');
    sendDraft(null);
    return tag;
  };

  /** A received line: when its tag replays to exactly its text, type it out again. */
  hooks.replay = function (span, tags, text) {
    var value = tags && tags[TAG];
    if (!value || reduced) return;
    var entries;
    try { entries = JSON.parse(fromBase64Url(value)); } catch (e) { return; }
    if (!validEntries(entries) || tbt.replay(entries) !== text) return;
    var total = entries.reduce(function (sum, e) { return sum + Math.min(e[0], MAX_PAUSE); }, 0);
    span.classList.add('is-typing');
    tbt.play(entries, span, {
      speed: Math.max(1, total / MAX_REPLAY),
      maxPause: MAX_PAUSE,
      onEnd: function () {
        span.textContent = text;
        span.classList.remove('is-typing');
      }
    });
  };

  // ------------------------------------------------------------ the room

  var room = null;
  var presence = null;
  var ghosts = {};   // id -> {li, who, text, stream}
  var drafts = {};   // id -> {seq, text}
  var walkers = {};  // id -> true: walking a live derive, their mic is the walk (src/perma/liveWalk.js)

  hooks.onState = function (state) {
    if (!ROOMS || !state.nick) return;
    if (!room) {
      if (state.joined) start(state.nick);
      return;
    }
    if (!room.setNick) { // still loading the ICE list
      room.nick = state.nick;
      return;
    }
    if (room.nick !== state.nick) {
      room.setNick(state.nick);
      if (presence) {
        presence.me.name = state.nick;
        presence.sendState();
        presence.updateTile('me');
      }
    }
  };

  function iceServers() {
    if (!ICE || !window.fetch) return Promise.resolve([]);
    return fetch(ICE).then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.iceServers) || []; })
      .catch(function () { return []; });
  }

  function start(nick) {
    room = { nick: nick }; // claimed: a second onState while the ICE list loads changes nothing
    iceServers().then(function (ice) {
      var wanted = room.nick;
      room = new assembly.Room({ room: 'afpp:' + CHANNEL, wsUrl: ROOMS, iceServers: ice, nick: wanted });
      window.afppRoom = room;
      if (strip && assembly.Presence) {
        presence = new assembly.Presence(strip, {
          room: room,
          name: wanted,
          onName: function () {},
          writingLabel: writingLabel,
          onGoto: function (id) { if (ghosts[id]) ghosts[id].li.scrollIntoView({ block: 'nearest' }); }
        });
        localize(presence);
        strip.hidden = false;
      }
      bindRoom();
      room.connect();
      setInterval(function () { sendDraft(false); }, STREAM_EVERY);
    });
  }

  function writingLabel(id) {
    var text = id === 'me' ? recorder.value : drafts[id] && drafts[id].text;
    return text ? S('writing') : null;
  }

  // the next part of the typing; `full` for people who just came in
  function sendDraft(full) {
    if (!room || !room.broadcast) return;
    if (full === null) {
      if (sentTo) room.broadcast('draft', null);
      sentTo = '';
      recorder.drain();
      return;
    }
    var entries = recorder.drain();
    if (!entries.length && !full) return;
    if (!recorder.value && !sentTo) return;
    room.broadcast('draft', { seq: ++seq, entries: entries, text: recorder.value });
    if (!!sentTo !== !!recorder.value && presence) presence.updateTile('me');
    sentTo = recorder.value;
  }

  function bindRoom() {
    room.on('draft', receiveDraft);
    room.on('left', function (id) { removeGhost(id); delete walkers[id]; });
    // presence.js keeps name, mic and camera from 'state'; a live walk adds `walking`
    room.on('state', function (from, state) {
      walkers[from] = !!(state && state.walking);
      if (presence) presence.updateTile(from);
    });
    room.on('users', function (users, joined) {
      Object.keys(ghosts).forEach(function (id) { if (!users[id]) removeGhost(id); });
      if (joined.length && recorder.value) sendDraft(true);
    });
  }

  function nameOf(id) {
    return (presence && presence.name(id)) || (room.users[id] && room.users[id].name) || '…';
  }

  function receiveDraft(from, draft) {
    if (!draft || typeof draft.text !== 'string' || !draft.text) {
      delete drafts[from];
      removeGhost(from);
      if (presence) presence.updateTile(from);
      return;
    }
    var previous = drafts[from];
    var continuous = previous && draft.seq === previous.seq + 1 && validEntries(draft.entries);
    var text = draft.text.slice(0, 400);
    drafts[from] = { seq: draft.seq, text: text };
    var ghost = ghosts[from] || makeGhost(from);
    ghost.who.textContent = S('writes', { n: nameOf(from) });
    if (continuous && !reduced) ghost.stream.push(draft.entries, text);
    else ghost.stream.reset(text);
    if (!previous && presence) presence.updateTile(from);
  }

  // A line still being written, kept at the bottom of the log (afpp-chat.js adds new lines above it).
  function makeGhost(from) {
    var nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    var li = document.createElement('li');
    li.className = 'chat__ghost';
    li.setAttribute('data-user', from);
    li.setAttribute('aria-hidden', 'true'); // the finished line is announced, not every key
    var who = document.createElement('span');
    who.className = 'chat__nick';
    var text = document.createElement('span');
    text.className = 'chat__text';
    li.appendChild(who);
    li.appendChild(text);
    log.appendChild(li);
    if (nearBottom) log.scrollTop = log.scrollHeight;
    var ghost = ghosts[from] = { li: li, who: who, text: text };
    ghost.stream = new tbt.Stream(function (value, caret) {
      text.textContent = '';
      text.appendChild(document.createTextNode(value.slice(0, caret)));
      var cursor = document.createElement('span');
      cursor.className = 'tbt-caret';
      text.appendChild(cursor);
      text.appendChild(document.createTextNode(value.slice(caret)));
    });
    return ghost;
  }

  function removeGhost(id) {
    var ghost = ghosts[id];
    if (!ghost) return;
    ghost.stream.stop();
    ghost.li.remove();
    delete ghosts[id];
  }

  // ------------------------------------------------------------ the strip, in AFPP's words

  /**
   * presence.js is KLAP's, shared unchanged: its English, KLAP-worded labels
   * are replaced here, on the instance, after each method that writes them.
   * Its name field is hidden (theme.css): in #AFPP the IRC nick is the name.
   */
  function localize(p) {
    var A = assembly;
    p.renderer = new A.ascii.Renderer({ cols: 72 }); // light text on the dark ground
    var head = strip.querySelector('.strip-head strong');
    if (head) head.textContent = S('present');
    p.toggle.textContent = S('settings');
    p.camButtons.off.textContent = S('camOff');
    p.camButtons.ascii.textContent = S('camAscii');
    p.camButtons.video.textContent = S('camVideo');
    var asciiLabel = strip.querySelector('.ascii-view');
    if (asciiLabel && asciiLabel.lastChild) asciiLabel.lastChild.textContent = ' ' + S('asciiAll');

    p.updateStatus = function () {
      var count = this.count();
      this.status.textContent = this.connection === 'live'
        ? (count === 1 ? S('onlyYou') : S('hereN', { c: count }))
        : this.connection === 'offline' ? S('roomOffline') : S('roomConnecting');
      if (this.soundBlocked) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'link';
        b.setAttribute('data-action', 'sound');
        b.textContent = S('enableSound');
        this.status.appendChild(document.createTextNode(' '));
        this.status.appendChild(b);
      }
    };
    var updateControls = p.updateControls;
    p.updateControls = function () {
      updateControls.call(this);
      this.micButton.textContent = this.me.mic ? S('micOn') : S('micOff');
    };
    var updateTile = p.updateTile;
    p.updateTile = function (id) {
      var tile = updateTile.call(this, id);
      if (!tile) return tile;
      var person = id === 'me' ? this.me : this.people[id];
      var name = tile.caption.querySelector('.tile-name');
      var mic = tile.caption.querySelector('.tile-mic');
      if (name) name.textContent = id === 'me' ? person.name + ' ' + S('you') : person.name || '…';
      if (mic) mic.textContent = person.mic ? S('micOn') : S('muted');
      tile.el.classList.toggle('is-walking', !!walkers[id]);
      if (walkers[id]) {
        var w = document.createElement('span');
        w.className = 'tile-walking';
        w.textContent = S('walking');
        tile.caption.appendChild(w);
      }
      return tile;
    };
    var afterMediaChange = p.afterMediaChange;
    p.afterMediaChange = function () {
      afterMediaChange.call(this);
      this.mediaNote.textContent = S('asciiNote');
    };
    var mediaError = p.mediaError;
    p.mediaError = function (error) {
      mediaError.call(this, error);
      this.mediaNote.textContent = error && error.name === 'NotAllowedError'
        ? S('noPermission') : S('noDevice', { e: (error && error.name) || error });
    };

    p.mediaNote.textContent = S('asciiNote');
    p.updateControls();
    p.updateTile('me');
    p.updateStatus();
  }
})();
