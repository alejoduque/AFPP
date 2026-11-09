/**
 * The street map: where the planet lands when you zoom in, and where you walk.
 * One map for listening and for recording (it was two: the listener's local
 * map and the recorder's field map).
 *
 * One tile layer only (OpenStreetMap), turned into 1-bit purple line art by
 * the #afpp-1bit filter (OneBit.jsx). The line art reads from zoom 8 up; below
 * that it is only labels, so the map gives way to the planet (stage.mjs).
 *
 *   you            a white square, blinking; the map follows you until you pan
 *   your derive    the live trace, white
 *   your past      your derives in ink, your sounds as ink squares
 *   shared         everyone's shared derives: click a trace for its sounds,
 *                  click a sound to hear it, send it to the rings
 *   walking now    live walks (walks.mjs), dashed white, the walker blinking
 */
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchDerives, audioUrl, fetchTelegram, telegramFileUrl } from './api.js';
import { AFPP_ENABLED } from '../config/afpp.js';
import { INK, LIT } from './palette.js';
import { addLineArtTiles } from './OneBit.jsx';
import { glyphIcon, crumbsLayer } from './glyphs.js';
import { ago } from './GlobeView.jsx';
import { MAP_MIN_ZOOM } from './stage.mjs';
import walkSessionService from '../services/walkSessionService.js';
import localStorageService from '../services/localStorageService.js';
import { t } from '../i18n';

/** Zoom at which `km` spans the map's width at this latitude (Web Mercator). */
export function zoomForKm(lat, widthPx, km = 10) {
  const metersPerPx = (km * 1000) / Math.max(200, widthPx);
  return Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / metersPerPx);
}

/** 1-bit marks for the Telegram group's files on the map. */
const TG_MARK = { photo: '▣', video: '▶', sound: '♪', file: '▤' };

const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function toSource(derive, rec) {
  return {
    id: `${derive.id}/${rec.id}`,
    name: rec.name || rec.tags?.[0] || t('afpp.sound'),
    alias: derive.alias,
    lat: rec.lat,
    lng: rec.lng,
    url: audioUrl(rec.audio),
  };
}

export default function WalkMap({
  center, zoom, follow: followAtStart = false, gps, trace = [], version = 0, live = new Map(),
  playingId, mixIds = [], onPlay, onToMix, onPlanet, onLocate, focusSession,
  telegramOn = true, telegramLive = [],
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef({});
  const sharedRef = useRef(new Map()); // derive id → {d, line, hit, markers}
  const follow = useRef(followAtStart);
  const [following, setFollowing] = useState(followAtStart);
  const [selected, setSelected] = useState(null);
  const [tgPick, setTgPick] = useState(null); // a Telegram file, open in the panel
  const tgItems = useRef(new Map()); // id → item (the group's files in view)
  const tgOnRef = useRef(telegramOn);
  tgOnRef.current = telegramOn;
  const [, setTick] = useState(0);
  const [error, setError] = useState(null);
  const cb = useRef({});
  cb.current = { onPlay, onPlanet };

  // ------------------------------------------------------------ the map
  useEffect(() => {
    const el = elRef.current;
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0.25,
      minZoom: MAP_MIN_ZOOM - 1, // one step below the line art's floor: that step hands over to the planet
      maxZoom: 19,
      worldCopyJump: true,
    }).setView(center, zoom);
    L.control.zoom({ position: 'topright' }).addTo(map);
    addLineArtTiles(map);
    layers.current = {
      mine: L.layerGroup().addTo(map),
      walking: L.layerGroup().addTo(map),
      telegram: L.layerGroup().addTo(map),
      live: L.polyline([], { color: LIT, weight: 3, lineCap: 'square', lineJoin: 'miter' }).addTo(map),
      me: null,
    };
    map.on('click', () => {
      setSelected(null);
      setTgPick(null);
    });
    map.on('dragstart', () => {
      follow.current = false;
      setFollowing(false);
    });
    map.on('zoomend', () => {
      if (map.getZoom() < MAP_MIN_ZOOM) {
        const c = map.getCenter();
        cb.current.onPlanet?.({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
      }
    });
    mapRef.current = map;
    // the chat or the rings opening resize the map's box
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    let alive = true;
    let timer = null;
    const load = () => {
      if (!AFPP_ENABLED) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const b = map.getBounds().pad(0.5);
        try {
          const box = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
          const list = await fetchDerives(box);
          if (!alive) return;
          drawShared(list);
          setError(null);
          if (tgOnRef.current) {
            const items = await fetchTelegram(box).catch(() => []);
            if (!alive) return;
            for (const it of items) tgItems.current.set(it.id, it);
            drawTelegram();
          }
        } catch (e) {
          if (alive) setError(e.message);
        }
      }, 300);
    };
    map.on('moveend', load);
    load();

    return () => {
      alive = false;
      clearTimeout(timer);
      ro.disconnect();
      map.remove();
      sharedRef.current.clear();
    };
    // center and zoom only seed the view; a new place remounts this map (key in AfppApp)
  }, []);

  // ------------------------------------------------------------ shared derives
  function drawShared(list) {
    const map = mapRef.current;
    if (!map) return;
    // your own shared derive is drawn as yours (its id is the session id, see afppShareService)
    const mine = new Set(walkSessionService.getAllSessions().map((s) => s.sessionId));
    for (const d of list) {
      if (mine.has(d.id) || sharedRef.current.has(d.id)) continue;
      const pts = d.breadcrumbs.map((b) => [b.lat, b.lng]);
      const line = L.polyline(pts, { color: INK, weight: 2, opacity: 1, lineCap: 'square', lineJoin: 'miter' }).addTo(map);
      // a wider invisible twin, so a finger can hit the trace
      const hit = L.polyline(pts, { weight: 18, opacity: 0 }).addTo(map);
      crumbsLayer(pts, map)?.addTo(map);
      const pick = (e) => {
        L.DomEvent.stopPropagation(e);
        setSelected(d.id);
      };
      line.on('click', pick);
      hit.on('click', pick);
      const markers = d.recordings
        .filter((r) => r.audio)
        .map((r) => {
          const m = L.marker([r.lat, r.lng], {
            icon: glyphIcon('sound', 'afpp-rec', '', `${d.id}/${r.id}`),
            title: `${d.alias} · ${r.name || ''}`,
            keyboard: true,
          }).addTo(map);
          m.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            setSelected(d.id);
            cb.current.onPlay(toSource(d, r));
          });
          m._afppId = `${d.id}/${r.id}`;
          return m;
        });
      sharedRef.current.set(d.id, { d, line, hit, markers });
    }
    setTick((n) => n + 1);
  }

  // ------------------------------------------------------------ the Telegram group's files
  // Each sender's files, in time order, are their breadcrumbs: a dotted line
  // from one place they shared something to the next.
  function drawTelegram() {
    const g = layers.current.telegram;
    if (!g) return;
    g.clearLayers();
    if (!tgOnRef.current) return;
    const bySender = new Map();
    for (const it of tgItems.current.values()) {
      if (it.lat == null) continue;
      if (!bySender.has(it.name)) bySender.set(it.name, []);
      bySender.get(it.name).push(it);
    }
    for (const list of bySender.values()) {
      list.sort((a, b) => a.t - b.t);
      if (list.length > 1) {
        L.polyline(list.map((it) => [it.lat, it.lng]), { color: INK, weight: 1, dashArray: '1 6', lineCap: 'square', interactive: false }).addTo(g);
      }
      for (const it of list) {
        const m = L.marker([it.lat, it.lng], {
          icon: L.divIcon({ className: `afpp-tg afpp-tg--${it.kind}`, iconSize: [18, 18], html: TG_MARK[it.kind] || TG_MARK.file }),
          title: `✈ ${it.name} · ${t(`tg.kind.${it.kind}`)}`,
          keyboard: true,
        }).addTo(g);
        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          setSelected(null);
          setTgPick(it);
        });
      }
    }
  }

  useEffect(() => {
    for (const it of telegramLive) tgItems.current.set(it.id, it);
    drawTelegram();
    if (!telegramOn) setTgPick(null);
    // a layer just switched on: fetch what is in view
    if (telegramOn && mapRef.current && !telegramLive.length) mapRef.current.fire('moveend');
  }, [telegramOn, telegramLive]);

  // light up what is selected, playing, or in the rings
  useEffect(() => {
    for (const [id, { line, markers }] of sharedRef.current) {
      const on = id === selected || markers.some((m) => m._afppId === playingId);
      line.setStyle({ color: on ? LIT : INK, weight: on ? 3 : 2 });
      if (on) line.bringToFront();
      for (const m of markers) {
        const el = m.getElement();
        if (!el) continue;
        el.classList.toggle('is-playing', m._afppId === playingId);
        el.classList.toggle('is-mixed', mixIds.includes(m._afppId));
        el.classList.toggle('is-selected', id === selected);
      }
    }
  });

  // ------------------------------------------------------------ yours
  useEffect(() => {
    const g = layers.current.mine;
    const map = mapRef.current;
    if (!g || !map) return;
    g.clearLayers();
    for (const s of walkSessionService.getCompletedSessions()) {
      if (s.breadcrumbs?.length > 1) {
        const pts = s.breadcrumbs.map((b) => [b.lat, b.lng]);
        L.polyline(pts, { color: INK, weight: 2, lineCap: 'square' }).addTo(g);
        crumbsLayer(pts, map)?.addTo(g);
      }
    }
    for (const r of localStorageService.getAllRecordings()) {
      if (!r.location) continue;
      const m = L.marker([r.location.lat, r.location.lng], {
        icon: glyphIcon('sound', 'perma-rec', r.uniqueId === playingId ? 'is-playing' : '', r.uniqueId),
        title: r.displayName || t('afpp.sound'),
      }).addTo(g);
      m.on('click', async (e) => {
        L.DomEvent.stopPropagation(e);
        const url = (await localStorageService.getPlayableUrl(r.uniqueId))
          || await localStorageService.getAudioBlobFlexible(r.uniqueId).then((b) => (b ? URL.createObjectURL(b) : null));
        if (url) cb.current.onPlay({ id: r.uniqueId, name: r.displayName || t('afpp.sound'), alias: t('perma.you'), url, lat: r.location.lat, lng: r.location.lng });
      });
    }
  }, [version, playingId]);

  // you, followed until you pan
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gps) return;
    const ll = [gps.lat, gps.lng];
    if (!layers.current.me) {
      layers.current.me = L.marker(ll, { icon: glyphIcon('me', 'perma-me'), interactive: false, keyboard: false }).addTo(map);
    } else {
      layers.current.me.setLatLng(ll);
    }
    if (follow.current) map.panTo(ll, { animate: true });
  }, [gps]);

  // the derive you are walking
  useEffect(() => {
    const map = mapRef.current;
    layers.current.live?.setLatLngs(trace);
    layers.current.liveCrumbs?.remove();
    layers.current.liveCrumbs = map ? crumbsLayer(trace, map)?.addTo(map) : null;
  }, [trace]);

  // the others walking right now
  useEffect(() => {
    const g = layers.current.walking;
    if (!g) return;
    g.clearLayers();
    for (const tr of live.values()) {
      const pts = tr.crumbs.map((c) => [c.lat, c.lng]);
      if (!pts.length) continue;
      if (pts.length > 1) L.polyline(pts, { color: LIT, weight: 2, dashArray: '2 5', lineCap: 'square' }).addTo(g);
      if (tr.live) {
        L.marker(pts[pts.length - 1], { icon: L.divIcon({ className: 'afpp-walker', iconSize: [10, 10] }), title: `◍ ${tr.alias}`, keyboard: false }).addTo(g);
      }
    }
  }, [live]);

  // one of your derives, from ≡
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusSession) return;
    const s = walkSessionService.getSession(focusSession.id);
    const pts = [
      ...(s?.breadcrumbs || []).map((b) => [b.lat, b.lng]),
      ...walkSessionService.getSessionRecordings(focusSession.id).filter((r) => r.location).map((r) => [r.location.lat, r.location.lng]),
    ];
    if (!pts.length) return;
    follow.current = false;
    setFollowing(false);
    map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 18 });
  }, [focusSession]);

  const recenter = () => {
    follow.current = true;
    setFollowing(true);
    if (gps) mapRef.current?.setView([gps.lat, gps.lng], Math.max(16, mapRef.current.getZoom()));
    else onLocate?.();
  };

  const entry = selected ? sharedRef.current.get(selected) : null;
  const d = entry?.d;

  return (
    <div className="afpp-local">
      <div ref={elRef} className="afpp-local__map" />
      <button type="button" className={`afpp-btn perma-recenter ${following && gps ? 'is-lit' : ''}`} onClick={recenter} aria-label={t('perma.recenter')}>
        ⌖
      </button>
      {error && <p className="afpp-local__error afpp-warn">{t('afpp.map.offline')}</p>}
      {tgPick && !d && (
        <aside className="afpp-panel afpp-tgpanel" aria-live="polite">
          <header>
            <b>✈ {tgPick.name}</b> <span>· {t(`tg.kind.${tgPick.kind}`)}</span>
            <button type="button" className="afpp-x" onClick={() => setTgPick(null)} aria-label={t('common.close')}>
              ×
            </button>
          </header>
          <p className="afpp-dim">
            {ago(tgPick.t)} · {t(`tg.how.${tgPick.how || 'location'}`)}
          </p>
          {tgPick.caption && <p>{tgPick.caption}</p>}
          {tgPick.file && tgPick.kind === 'photo' && <img src={telegramFileUrl(tgPick.file)} alt={tgPick.caption || t('tg.kind.photo')} loading="lazy" />}
          {tgPick.file && tgPick.kind === 'video' && <video src={telegramFileUrl(tgPick.file)} controls playsInline preload="metadata" />}
          {tgPick.file && tgPick.kind === 'sound' && <audio src={telegramFileUrl(tgPick.file)} controls preload="metadata" />}
          {tgPick.file ? (
            <a className="afpp-btn" href={telegramFileUrl(tgPick.file)} target="_blank" rel="noopener" download={tgPick.kind === 'file' ? tgPick.filename || true : undefined}>
              {t(tgPick.kind === 'file' ? 'tg.download' : 'tg.open')} {tgPick.filename ? `· ${tgPick.filename}` : ''}
            </a>
          ) : (
            <p className="afpp-dim">{t('tg.tooBig')}</p>
          )}
        </aside>
      )}
      {d && (
        <aside className="afpp-panel" aria-live="polite">
          <header>
            <b>{d.alias}</b> {d.title && <span>· {d.title}</span>}
            <button type="button" className="afpp-x" onClick={() => setSelected(null)} aria-label={t('common.close')}>
              ×
            </button>
          </header>
          <p className="afpp-dim">{ago(d.endTime || d.updatedAt)}</p>
          <ul>
            {d.recordings.filter((r) => r.audio).map((r) => {
              const src = toSource(d, r);
              const playing = playingId === src.id;
              const mixed = mixIds.includes(src.id);
              return (
                <li key={r.id} className={playing ? 'is-lit' : ''}>
                  <button type="button" className="afpp-btn afpp-btn--play" onClick={() => onPlay(playing ? null : src)}>
                    {playing ? '■' : '▶'}
                  </button>
                  <span className="afpp-panel__name">
                    {src.name}
                    {r.tags?.some((tg) => tg !== src.name) ? <i> {r.tags.filter((tg) => tg !== src.name).join(', ')}</i> : null}
                  </span>
                  <span className="afpp-dim">{fmtDur(r.duration || 0)}</span>
                  <button type="button" className="afpp-btn" disabled={mixed} onClick={() => onToMix(src)}>
                    {mixed ? t('afpp.map.inRings') : t('afpp.map.toRings')}
                  </button>
                </li>
              );
            })}
            {!d.recordings.some((r) => r.audio) && <li className="afpp-dim">{t('afpp.map.noSounds')}</li>}
          </ul>
        </aside>
      )}
    </div>
  );
}
