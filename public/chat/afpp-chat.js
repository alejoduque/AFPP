/*
 * AFPP fork of iScream's chat.js (iscream/www/js/chat.js), for #AFPP on
 * altred.xyz/AlpineFeministPunkParade: the channel comes from data-channel, and every
 * line it shows from window.AFPP_CHAT_STRINGS (the site's translations). The
 * IRC handling is unchanged; history comes from the AFPP bitácora, not
 * Radiolibre's. Not bridged to Telegram.
 *
 * iScream — a deliberately tiny IRC client for #radiolibre.
 *
 * Talks to Ergo over a WebSocket with the IRCv3 "text.ircv3.net" subprotocol:
 * one IRC line per text frame, no CRLF. Same-origin /irc by default: in
 * production nginx routes it to Ergo; locally server.js does when CHAT_PROXY
 * is set. radiolibre.altred.xyz carries a copy of this file (keep in step).
 *
 * Everything received is written with textContent — never innerHTML — so
 * nothing anyone types can become markup on another person's screen.
 *
 * radiolibre additions (escucha.js, the spectrogram with the chat on it):
 *  - asks Ergo for IRCv3 server-time, so a line's time is the server's;
 *  - hands every channel line to window.chatHooks.onLine({ t, nick, texto, fuente });
 *  - lets window.chatHooks.route(text, joined) keep a line as a note instead
 *    of sending it, or rewrite it (a reply);
 *  - window.chatState tells whether you are in the channel, and as whom.
 * Without escucha.js on the page, none of this changes what the chat does.
 *
 * AFPP additions (afpp-assembly.js, the assembly beside IRC):
 *  - also asks for IRCv3 message-tags, so a line can carry client tags;
 *  - window.chatHooks.tbt(text) may return a client tag ("key=value") to send
 *    with the line, and .replay(span, tags, text) may redraw a received one;
 *  - window.chatHooks.onState({ joined, nick }) when that changes;
 *  - lines are added above the live ghosts (.chat__ghost) at the log's end.
 */
(function () {
  'use strict';

  var CHANNEL = document.getElementById('chat-join').getAttribute('data-channel') || '#AFPP';
  // Nicks that relay the Telegram group as "<name> text" (shown as that name, marked ✈).
  var BRIDGES = (document.getElementById('chat-join').getAttribute('data-bridge') || 'afpp-bitacora').toLowerCase().split(',');
  // Every line this client says, from the page (window.AFPP_CHAT_STRINGS, set from the site's
  // translations); English if the page sets none. {x} placeholders are filled by S().
  var STR = {
    connecting: 'Connecting…', cantOpen: 'Could not open the chat.', lost: 'Lost the connection to the chat.',
    retry: 'Offline. Retrying in {s} s…', nickTaken: 'That nickname is taken.', inAs: 'In {ch} as {me}',
    joinedNote: 'You joined {ch}. What you write also goes to the AFPP Telegram group, and stays in the public bitácora.',
    joined: '{n} joined', left: '{n} left', quit: '{n} disconnected', nowIs: '{n} is now {m}',
    kicked: '{n} was kicked by {by}', youKicked: 'You were removed from the channel.', topic: 'Topic: {t}',
    people1: '1 person in the channel', peopleN: '{c} people in the channel', private: '(private) ',
    closed: 'The server closed the connection.', failed: 'Could not do that.',
    joinFirst: 'To write in the channel, pick a nickname and join first.', commands: 'Commands: /nick new_name, /me action',
    empty: 'No messages in the chat yet.', latest: 'Latest messages · pick a nickname to write'
  };
  function S(key, vars) {
    var src = (window.AFPP_CHAT_STRINGS && window.AFPP_CHAT_STRINGS[key]) || STR[key] || key;
    return src.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }
  var MAX_LINES = 300;
  // Same-origin /irc by default; a page on another host (radiolibre.altred.xyz)
  // points at reporta's with data-irc on the join form. Ergo only accepts the
  // origins listed in its allowed-origins.
  // The last lines come from the bitácora (the puente writes every channel line
  // there); another host points at reporta's with data-log.
  var LOG_URL = document.getElementById('chat-join').getAttribute('data-log') || '/bitacora.json';
  var HISTORY_LINES = 10;
  var URL_ = document.getElementById('chat-join').getAttribute('data-irc') ||
    (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/irc';
  var NICK_KEY = 'iscream.nick';

  var $ = function (id) { return document.getElementById(id); };
  var joinForm = $('chat-join');
  var nickInput = $('chat-nick');
  var chat = $('chat');
  var statusEl = $('chat-status');
  var log = $('chat-log');
  var sayForm = $('chat-say');
  var input = $('chat-input');

  var ws = null;
  var me = '';
  var wanted = '';
  var joined = false;
  var leaving = false;
  var retry = 0;
  var retryTimer = null;
  var offered = [];
  var caps = [];   // acknowledged IRCv3 capabilities

  // ------------------------------------------------------------ helpers

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  }

  // IRC nicknames: ASCII letters, digits and a few symbols, not starting with a digit or '-'.
  function cleanNick(raw) {
    var n = (raw || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_').replace(/[^A-Za-z0-9_\-\[\]\\`^{}|]/g, '').slice(0, 20);
    if (!n || /^[0-9-]/.test(n)) n = 'anon' + (n ? '_' + n : '-' + Math.floor(1000 + Math.random() * 9000));
    return n.slice(0, 20);
  }

  // Colour, bold, italic, reset… codes are noise on a web page.
  function stripFormatting(s) {
    return s.replace(/\x03(\d{1,2}(,\d{1,2})?)?|[\x02\x0f\x11\x16\x1d\x1e\x1f]/g, '');
  }

  function parse(line) {
    var m = { tags: {}, prefix: '', command: '', params: [] };
    var i = 0;
    if (line[0] === '@') {
      i = line.indexOf(' ') + 1;
      line.slice(1, i - 1).split(';').forEach(function (kv) {
        var eq = kv.indexOf('=');
        if (eq > 0) m.tags[kv.slice(0, eq)] = kv.slice(eq + 1);
      });
    }
    if (line[i] === ':') { var sp = line.indexOf(' ', i); m.prefix = line.slice(i + 1, sp); i = sp + 1; }
    while (line[i] === ' ') i++;
    var rest = line.slice(i);
    var trail = rest.indexOf(' :');
    var head = trail >= 0 ? rest.slice(0, trail) : rest;
    var parts = head.split(' ').filter(Boolean);
    m.command = (parts.shift() || '').toUpperCase();
    m.params = parts;
    if (trail >= 0) m.params.push(rest.slice(trail + 2));
    m.nick = m.prefix.split('!')[0];
    return m;
  }

  function send(line) {
    if (ws && ws.readyState === 1) ws.send(line.replace(/[\r\n]/g, ' '));
  }

  function setStatus(text, state) {
    statusEl.textContent = text;
    statusEl.dataset.state = state || '';
  }

  function hhmm() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // A time for a stored line: "23:24" today, "27/09 23:24" before.
  function stamp(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var p2 = function (n) { return String(n).padStart(2, '0'); };
    var today = new Date();
    var day = d.toDateString() === today.toDateString() ? '' : p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' ';
    return day + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  function add(kind, nick, text, opts) {
    opts = opts || {};
    var nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    var li = document.createElement('li');
    li.className = 'is-' + kind + (nick && nick === me && !opts.history ? ' is-self' : '') + (opts.history ? ' is-history' : '');
    var t = document.createElement('span');
    t.className = 'chat__time';
    t.textContent = opts.time || hhmm();
    li.appendChild(t);
    if (nick && kind !== 'event') {
      var n = document.createElement('span');
      n.className = 'chat__nick';
      n.textContent = kind === 'action' ? '* ' + nick : '<' + nick + '>';
      li.appendChild(n);
    }
    var body = document.createElement('span');
    body.className = 'chat__text';
    body.textContent = stripFormatting(text);
    li.appendChild(body);
    log.insertBefore(li, opts.before || log.querySelector('.chat__ghost'));
    while (log.children.length > MAX_LINES) log.removeChild(log.firstChild);
    if (nearBottom || nick === me) log.scrollTop = log.scrollHeight;
    return body;
  }

  function hook(name, arg) {
    var hooks = window.chatHooks;
    return hooks && typeof hooks[name] === 'function' ? hooks[name](arg) : undefined;
  }

  function changed() {
    hook('onState', { joined: joined, nick: me });
  }

  // ------------------------------------------------------------ connection

  function connect() {
    clearTimeout(retryTimer);
    leaving = false;
    joined = false;
    setStatus(S('connecting'));
    try {
      ws = new WebSocket(URL_, 'text.ircv3.net');
    } catch (e) {
      setStatus(S('cantOpen'), 'error');
      return;
    }
    ws.onopen = function () {
      me = wanted;
      send('CAP LS 302');
      send('NICK ' + wanted);
      send('USER ' + wanted + ' 0 * :iScream');
    };
    ws.onmessage = function (ev) {
      if (typeof ev.data === 'string') ev.data.split(/\r?\n/).forEach(function (l) { if (l) handle(parse(l)); });
    };
    ws.onclose = function () {
      ws = null;
      caps = [];
      if (leaving) return;
      if (joined) add('event', '', S('lost'));
      if (joined) { joined = false; changed(); }
      var wait = Math.min(30, Math.pow(2, retry++)) * 1000;
      setStatus(S('retry', { s: wait / 1000 }), 'error');
      retryTimer = setTimeout(connect, wait);
    };
  }

  function handle(m) {
    var p = m.params;
    switch (m.command) {
      case 'CAP':
        // Ask for server-time and message-tags if offered (a long LS comes in several lines marked '*').
        if (p[1] === 'LS') {
          offered = offered.concat((p[p.length - 1] || '').split(' ').map(function (c) { return c.split('=')[0]; }));
          if (p[2] === '*') break;
          var wantCaps = ['server-time', 'message-tags'].filter(function (c) { return offered.indexOf(c) >= 0; });
          send(wantCaps.length ? 'CAP REQ :' + wantCaps.join(' ') : 'CAP END');
          offered = [];
        } else if (p[1] === 'ACK' || p[1] === 'NAK') {
          if (p[1] === 'ACK') caps = (p[p.length - 1] || '').split(' ').filter(Boolean);
          send('CAP END');
        }
        break;
      case 'PING':
        send('PONG :' + (p[0] || ''));
        break;
      case '001': // welcome: registration done
        me = p[0];
        retry = 0;
        send('JOIN ' + CHANNEL);
        break;
      case '433': // nickname in use
      case '432': // erroneous nickname
        if (!joined) {
          wanted = cleanNick(wanted.slice(0, 16) + Math.floor(10 + Math.random() * 90));
          send('NICK ' + wanted);
        } else {
          add('event', '', S('nickTaken'));
        }
        break;
      case 'JOIN':
        if (m.nick === me) {
          joined = true;
          setStatus(S('inAs', { ch: CHANNEL, me: me }));
          add('event', '', S('joinedNote', { ch: CHANNEL }));
          changed();
        } else {
          add('event', '', S('joined', { n: m.nick }));
        }
        break;
      case 'PART':
        add('event', '', S('left', { n: m.nick }));
        break;
      case 'QUIT':
        add('event', '', S('quit', { n: m.nick }));
        break;
      case 'NICK':
        if (m.nick === me) {
          me = p[0];
          wanted = me;
          store(NICK_KEY, me);
          setStatus(S('inAs', { ch: CHANNEL, me: me }));
          changed();
        }
        add('event', '', S('nowIs', { n: m.nick, m: p[0] }));
        break;
      case 'KICK':
        add('event', '', S('kicked', { n: p[1], by: m.nick }) + (p[2] ? ' (' + p[2] + ')' : ''));
        if (p[1] === me) { joined = false; setStatus(S('youKicked'), 'error'); changed(); }
        break;
      case '332': // topic
        add('event', '', S('topic', { t: p[2] || '' }));
        break;
      case '353': // names
        var count = (p[3] || '').split(' ').filter(Boolean).length;
        if (count) add('event', '', count === 1 ? S('people1') : S('peopleN', { c: count }));
        break;
      case 'PRIVMSG':
      case 'NOTICE':
        var target = p[0];
        var text = p[1] || '';
        var action = /^\x01ACTION (.*)\x01?$/.exec(text);
        if (/^\x01/.test(text) && !action) break; // other CTCP: ignore
        if (target.toLowerCase() === CHANNEL.toLowerCase()) { // #AFPP: IRC channel names are case-insensitive
          // The Telegram bridge speaks as "telegram" and quotes the real speaker:
          // show that person, marked ✈, and its bitácora notices as events.
          if (BRIDGES.indexOf(m.nick.toLowerCase().replace(/\d+$/, '')) >= 0) { // the AFPP bot relaying the Telegram group
            var relayed = /^<([^>]{1,40})> ([\s\S]*)$/.exec(text);
            if (relayed) { add('msg', relayed[1] + ' ✈', relayed[2]); mark(m, relayed[1] + ' ✈', relayed[2], 'telegram'); break; }
            if (m.command === 'NOTICE') { add('event', '', text); break; }
          }
          var body = add(action ? 'action' : 'msg', m.nick, action ? ' ' + action[1].replace(/\x01$/, '') : text);
          // a line that carries its own typing (TBT) is typed out again
          if (!action && m.command === 'PRIVMSG' && stripFormatting(text) === text) window.chatHooks && window.chatHooks.replay && window.chatHooks.replay(body, m.tags, text);
          if (m.command === 'PRIVMSG') mark(m, m.nick, action ? '* ' + action[1].replace(/\x01$/, '') : text, 'irc');
        } else if (m.nick && m.nick.indexOf('.') === -1 && target === me) {
          add('msg', m.nick, S('private') + text);
        }
        break;
      case 'ERROR':
        setStatus(S('closed'), 'error');
        break;
      case '404': // cannot send to channel
      case '477':
      case '474':
      case '475':
      case '471':
      case '473':
        add('event', '', p[p.length - 1] || S('failed'));
        break;
    }
  }

  // ------------------------------------------------------------ UI

  joinForm.addEventListener('submit', function (e) {
    e.preventDefault();
    wanted = cleanNick(nickInput.value);
    store(NICK_KEY, wanted);
    joinForm.hidden = true;
    chat.hidden = false;
    sayForm.hidden = false;
    clearInterval(historyTimer); // from here on it's live
    connect();
    input.focus();
  });

  sayForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    // escucha.js may keep it as a note pinned to a moment of the audio, or turn it into a reply.
    var hooks = window.chatHooks;
    if (hooks && hooks.route && !/^\//.test(text)) {
      var r = hooks.route(text, joined) || {};
      if (r.handled) { input.value = ''; return; }
      if (r.text) text = r.text;
    }
    if (!joined) {
      add('event', '', S('joinFirst'));
      nickInput.focus();
      return;
    }
    var cmd = /^\/(\w+)\s*(.*)$/.exec(text);
    // the typing of this line, as a client tag, when the server relays them
    var tag = hook('tbt', cmd ? null : text);
    if (cmd) {
      var name = cmd[1].toLowerCase();
      if (name === 'nick' && cmd[2]) send('NICK ' + cleanNick(cmd[2]));
      else if (name === 'me' && cmd[2]) {
        send('PRIVMSG ' + CHANNEL + ' :\x01ACTION ' + cmd[2] + '\x01');
        add('action', me, ' ' + cmd[2]);
        mark(null, me, '* ' + cmd[2], 'irc');
      } else add('event', '', S('commands'));
    } else {
      send((tag && caps.indexOf('message-tags') >= 0 ? '@' + tag + ' ' : '') + 'PRIVMSG ' + CHANNEL + ' :' + text);
      add('msg', me, text);
      mark(null, me, text, 'irc');
    }
    input.value = '';
  });

  // A channel line for escucha.js: the server's time when it sent one, else now.
  function mark(m, nick, texto, fuente) {
    var hooks = window.chatHooks;
    if (!hooks || !hooks.onLine) return;
    var t = m && m.tags && m.tags.time ? new Date(m.tags.time) : new Date();
    if (isNaN(t)) t = new Date();
    hooks.onLine({ t: t, nick: nick, texto: stripFormatting(texto), fuente: fuente });
  }

  window.chatState = {
    joined: function () { return joined; },
    nick: function () { return joined ? me : (store(NICK_KEY) || ''); }
  };

  window.addEventListener('pagehide', function () {
    leaving = true;
    send('QUIT :chao');
  });

  // ------------------------------------------------------------ last lines

  /**
   * Before joining, the window already shows the last lines of the channel
   * (from the bitácora), dimmed, so whoever arrives sees what was going on.
   * They refresh until you join; after that the chat is live.
   */
  function loadHistory() {
    if (joined || !window.fetch) return;
    var url = LOG_URL + (LOG_URL.indexOf('?') < 0 ? '?' : '&') + 'solo=chat&ultimos=' + HISTORY_LINES;
    fetch(url, { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (data) {
      if (joined) return;
      var old = log.querySelectorAll('.is-history');
      for (var i = 0; i < old.length; i++) old[i].remove();
      var first = log.firstChild;
      var eventos = (data && data.eventos) || [];
      if (!eventos.length) {
        add('event', '', S('empty'), { history: true, before: first, time: ' ' });
      }
      eventos.forEach(function (ev) {
        var me_ = /^\* /.test(ev.texto);
        var who = ev.fuente === 'telegram' ? ev.nick + ' ✈' : ev.nick;
        add(me_ ? 'action' : 'msg', who, me_ ? ' ' + ev.texto.slice(2) : ev.texto, { history: true, before: first, time: stamp(ev.t) });
      });
      log.scrollTop = log.scrollHeight;
    }).catch(function () { /* no history: the live chat still works */ });
  }

  chat.hidden = false;
  sayForm.hidden = true;
  setStatus(S('latest'));
  loadHistory();
  var historyTimer = setInterval(function () { if (!document.hidden) loadHistory(); }, 30000);

  var saved = store(NICK_KEY);
  if (saved) nickInput.value = saved;
})();
