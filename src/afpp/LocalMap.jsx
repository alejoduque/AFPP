/**
 * The local map: where the globe lands, about 10 km across.
 *
 * One tile layer only (OpenStreetMap), turned into 1-bit purple line art by
 * an SVG edge filter (see #afpp-1bit in AfppApp). Shared derives are purple
 * traces with square sound markers; whatever is selected or sounding is
 * white. Click a trace to list its sounds; click a sound to hear it; send it
 * to the rings to mix it with sounds from elsewhere on the planet.
 */
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchDerives, audioUrl } from './api.js';
import { INK, LIT } from './palette.js';
import { addLineArtTiles } from './OneBit.jsx';
import { glyphIcon, crumbsLayer } from './glyphs.js';
import { ago } from './GlobeView.jsx';
import { t } from '../i18n';

const VIEW_KM = 10;

/** Zoom at which `km` spans the map's width at this latitude (Web Mercator). */
export function zoomForKm(lat, widthPx, km = VIEW_KM) {
  const metersPerPx = (km * 1000) / Math.max(200, widthPx);
  return Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / metersPerPx);
}

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

export default function LocalMap({ focus, playingId, mixIds, onPlay, onToMix, onBack }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef(new Map()); // derive id → {line, markers}
  const derivesRef = useRef(new Map());
  const [selected, setSelected] = useState(null); // derive id
  const [, setTick] = useState(0);
  const [error, setError] = useState(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // ------------------------------------------------------------ map setup
  useEffect(() => {
    const el = elRef.current;
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: 0.25,
      minZoom: 3,
      maxZoom: 19,
      worldCopyJump: true,
    }).setView([focus.lat, focus.lng], Math.min(17, zoomForKm(focus.lat, el.clientWidth)));
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    addLineArtTiles(map);
    map.on('click', () => setSelected(null));
    mapRef.current = map;
    // The chat panel opening or closing resizes the map's box.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    let alive = true;
    let timer = null;
    const load = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const b = map.getBounds().pad(0.5);
        try {
          const list = await fetchDerives([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
          if (!alive) return;
          for (const d of list) derivesRef.current.set(d.id, d);
          draw();
          setError(null);
        } catch (e) {
          if (alive) setError(e.message);
        }
      }, 250);
    };
    map.on('moveend', load);
    load();

    return () => {
      alive = false;
      clearTimeout(timer);
      ro.disconnect();
      map.remove();
      layersRef.current.clear();
    };
    // focus only matters at mount; a new focus remounts this component (key in AfppApp).
  }, []);

  // ------------------------------------------------------------ drawing
  function draw() {
    const map = mapRef.current;
    if (!map) return;
    for (const d of derivesRef.current.values()) {
      if (layersRef.current.has(d.id)) continue;
      const line = L.polyline(
        d.breadcrumbs.map((b) => [b.lat, b.lng]),
        { color: INK, weight: 2, opacity: 1, lineCap: 'square', lineJoin: 'miter' },
      ).addTo(map);
      // A wider invisible twin so a finger can hit the trace.
      const hit = L.polyline(line.getLatLngs(), { weight: 18, opacity: 0 }).addTo(map);
      crumbsLayer(d.breadcrumbs.map((b) => [b.lat, b.lng]), map)?.addTo(map);
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
            onPlay(toSource(d, r));
          });
          m._afppId = `${d.id}/${r.id}`;
          return m;
        });
      layersRef.current.set(d.id, { line, hit, markers });
    }
    setTick((n) => n + 1);
  }

  // Light up what is selected / playing / in the rings.
  useEffect(() => {
    for (const [id, { line, markers }] of layersRef.current) {
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

  const d = selected ? derivesRef.current.get(selected) : null;

  return (
    <div className="afpp-local">
      <div ref={elRef} className="afpp-local__map" />
      <div className="afpp-local__bar">
        <button type="button" className="afpp-btn" onClick={onBack}>
          ◯ {t('afpp.map.backToGlobe')}
        </button>
        <span className="afpp-dim">{t('afpp.map.scale', { km: VIEW_KM })}</span>
        {error && <span className="afpp-warn">{t('afpp.map.offline')}</span>}
      </div>
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
