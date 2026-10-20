/*
 * The AFPP bitácora page: reads the AFPP API's bitacora.json, lists events by
 * day (newest day first) in the reader's time zone, and adds new ones live
 * from the API's event stream. Everything is written with textContent.
 * Language: the same choice as the globe (localStorage afpp_lang), English
 * by default.
 *
 * A chat line written on the web keeps its typing (ev.tbt, Time Based Text):
 * ▶ plays it back as it was typed, with tbt.js from KLAP's assembly scripts.
 * A line that arrives live plays by itself.
 */
(function () {
  'use strict';

  var API = '../afpp/api/';
  var STR = {
    en: { globe: 'globe', howto: 'how to use', apk: 'Android app ↓',
      lede: 'A public text log: what is said in the #AFPP chat, and every derive shared on the Deriva Sonora global map. No audio here; the sounds are on the globe.',
      tz: "Times in your time zone; each day's file is in UTC.",
      foot: 'Alpine Feminist Punk Parade · Deriva Sonora · permasoftware, 1-bit',
      loading: 'Loading…', none: 'Nothing logged yet. Say something in #AFPP, or share a derive.',
      count: 'Recent: {c} in the chat · {d} shared derives.', fail: 'Could not read the bitácora. Retrying…',
      shared: 'shared', derive: 'a derive', sounds: '{n} sounds', sound1: '1 sound', listen: 'listen', typed: 'play it as it was typed' },
    de: { globe: 'Globus', howto: 'Anleitung', apk: 'Android-App ↓',
      lede: 'Ein öffentliches Textprotokoll: was im Chat #AFPP gesagt wird, und jede Dérive, die auf der Weltkarte von Deriva Sonora geteilt wird. Hier gibt es keinen Ton; die Klänge sind auf dem Globus.',
      tz: 'Zeiten in deiner Zeitzone; die Tagesdateien sind in UTC.',
      foot: 'Alpine Feminist Punk Parade · Deriva Sonora · Permasoftware, 1-Bit',
      loading: 'Lädt…', none: 'Noch nichts protokolliert. Sag etwas in #AFPP oder teile eine Dérive.',
      count: 'Zuletzt: {c} im Chat · {d} geteilte Dérives.', fail: 'Die Bitácora konnte nicht gelesen werden. Neuer Versuch…',
      shared: 'teilte', derive: 'eine Dérive', sounds: '{n} Klänge', sound1: '1 Klang', listen: 'anhören', typed: 'abspielen, wie es getippt wurde' },
    fr: { globe: 'globe', howto: 'mode d’emploi', apk: 'appli Android ↓',
      lede: 'Un journal public en texte : ce qui se dit dans le chat #AFPP, et chaque dérive partagée sur la carte mondiale de Deriva Sonora. Pas de son ici ; les sons sont sur le globe.',
      tz: 'Heures dans ton fuseau ; le fichier de chaque jour est en UTC.',
      foot: 'Alpine Feminist Punk Parade · Deriva Sonora · permasoftware, 1 bit',
      loading: 'Chargement…', none: 'Rien pour l’instant. Dis quelque chose dans #AFPP, ou partage une dérive.',
      count: 'Récemment : {c} dans le chat · {d} dérives partagées.', fail: 'Impossible de lire la bitácora. Nouvel essai…',
      shared: 'a partagé', derive: 'une dérive', sounds: '{n} sons', sound1: '1 son', listen: 'écouter', typed: 'rejouer comme ce fut tapé' },
    es: { globe: 'globo', howto: 'cómo usar', apk: 'app Android ↓',
      lede: 'Un registro público de texto: lo que se dice en el chat #AFPP, y cada deriva compartida en el mapa global de Deriva Sonora. Aquí no hay audio; los sonidos están en el globo.',
      tz: 'Horas en tu zona horaria; el archivo de cada día está en UTC.',
      foot: 'Alpine Feminist Punk Parade · Deriva Sonora · permasoftware, 1 bit',
      loading: 'Cargando…', none: 'Aún no hay nada. Di algo en #AFPP, o comparte una deriva.',
      count: 'Recientes: {c} en el chat · {d} derivas compartidas.', fail: 'No se pudo leer la bitácora. Reintentando…',
      shared: 'compartió', derive: 'una deriva', sounds: '{n} sonidos', sound1: '1 sonido', listen: 'escuchar', typed: 'reproducir como se escribió' }
  };
  var LOCALE = { en: 'en-GB', de: 'de-CH', fr: 'fr-CH', es: 'es-CO' };

  var lang = 'en';
  try { var stored = localStorage.getItem('afpp_lang'); if (STR[stored]) lang = stored; } catch (e) { /* default */ }

  var box = document.getElementById('bitacora');
  var statusEl = document.getElementById('status');
  var select = document.getElementById('lang');
  var eventos = [];

  function s(key, vars) {
    return (STR[lang][key] || STR.en[key]).replace(/\{(\w+)\}/g, function (_, k) { return vars ? vars[k] : ''; });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function applyLang() {
    document.documentElement.lang = lang;
    select.value = lang;
    var nodes = document.querySelectorAll('[data-i]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = s(nodes[i].getAttribute('data-i'));
    render();
  }

  function item(ev, fresh) {
    var time = new Intl.DateTimeFormat(LOCALE[lang], { hour: '2-digit', minute: '2-digit' }).format(new Date(ev.t));
    var li;
    if (ev.tipo === 'deriva') {
      li = el('li', 'ev ev--deriva');
      li.appendChild(el('time', null, time));
      li.appendChild(el('span', 'tag', '◍'));
      var t = el('span', 'texto', ev.alias + ' ' + s('shared') + ' ' + (ev.titulo ? '«' + ev.titulo + '»' : s('derive')) + ' · ' + (ev.n === 1 ? s('sound1') : s('sounds', { n: ev.n })) + ' · ');
      if (typeof ev.lat === 'number') {
        var a = el('a', null, s('listen'));
        a.href = '../#' + ev.lat.toFixed(4) + ',' + ev.lng.toFixed(4);
        t.appendChild(a);
      }
      li.appendChild(t);
    } else {
      li = el('li', 'ev ev--chat');
      li.appendChild(el('time', null, time));
      var action = /^\* /.test(ev.texto);
      var who = ev.fuente === 'telegram' ? ev.nick + ' ✈' : ev.nick;
      li.appendChild(el('span', 'nick', action ? '* ' + who : '<' + who + '>'));
      var texto = el('span', 'texto', action ? ev.texto.slice(2) : ev.texto);
      li.appendChild(texto);
      if (ev.tbt && tbt()) {
        var again = el('button', 'tbt-play', '▶');
        again.type = 'button';
        again.title = s('typed');
        again.setAttribute('aria-label', s('typed'));
        again.addEventListener('click', function () { typeOut(texto, ev); });
        texto.appendChild(document.createTextNode(' '));
        texto.appendChild(again);
        if (fresh && !reduced) setTimeout(function () { typeOut(texto, ev); }, 0);
      }
    }
    if (fresh) li.classList.add('is-new');
    return li;
  }

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tbt() { return window.arguman && window.arguman.assembly && window.arguman.assembly.tbt; }

  // Type a line out again; never longer than 8 s, a long pause shortened to 2.5 s.
  function typeOut(span, ev) {
    var entries = ev.tbt;
    var total = entries.reduce(function (sum, e) { return sum + Math.min(e[0], 2500); }, 0);
    var button = span.querySelector('.tbt-play');
    tbt().play(entries, span, {
      speed: Math.max(1, total / 8000),
      maxPause: 2500,
      onEnd: function () {
        span.textContent = ev.texto;
        if (button) { span.appendChild(document.createTextNode(' ')); span.appendChild(button); }
      }
    });
  }

  function render(freshId) {
    box.textContent = '';
    if (!eventos.length) { statusEl.textContent = s('none'); return; }
    var chats = eventos.filter(function (e) { return e.tipo === 'chat'; }).length;
    statusEl.textContent = s('count', { c: chats, d: eventos.length - chats });
    var dayFmt = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var byDay = {};
    var order = [];
    eventos.forEach(function (ev) {
      var d = new Date(ev.t);
      var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (!byDay[key]) { byDay[key] = { date: d, items: [], files: {} }; order.push(key); }
      byDay[key].items.push(ev);
      byDay[key].files[ev.t.slice(0, 10)] = true;
    });
    order.reverse().forEach(function (key) {
      var day = byDay[key];
      var section = el('section', 'dia');
      section.appendChild(el('h2', null, dayFmt.format(day.date)));
      var list = el('ol');
      day.items.forEach(function (ev) { list.appendChild(item(ev, ev.id === freshId)); });
      section.appendChild(list);
      var files = el('p', 'files');
      Object.keys(day.files).sort().forEach(function (f) {
        var a = el('a', null, f + '.txt');
        a.href = API + 'bitacora/' + f + '.txt';
        files.appendChild(a);
        files.appendChild(document.createTextNode(' '));
      });
      section.appendChild(files);
      box.appendChild(section);
    });
  }

  function load() {
    statusEl.textContent = s('loading');
    fetch(API + 'bitacora.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) { eventos = data.eventos || []; render(); })
      .catch(function () { statusEl.textContent = s('fail'); setTimeout(load, 15000); });
  }

  function live() {
    if (!window.EventSource) return;
    var es = new EventSource(API + 'events');
    es.addEventListener('bitacora', function (e) {
      var ev = JSON.parse(e.data);
      eventos.push(ev);
      render(ev.id);
    });
    es.addEventListener('remove', function () { load(); }); // an unshared derive leaves the log
  }

  select.addEventListener('change', function () {
    lang = select.value;
    try { localStorage.setItem('afpp_lang', lang); } catch (e) { /* not kept */ }
    applyLang();
  });

  applyLang();
  load();
  live();
})();
