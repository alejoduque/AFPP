/**
 * The field map: one 1-bit layer (OSM as purple line art), nothing else.
 *
 *   you          a white square, blinking
 *   your derive  the live trace, white
 *   your past    derives in ink, sounds as ink squares
 *   others       shared derives near you, dashed ink, their sounds hollow
 *
 * Tap a sound to hear it. The map follows you until you pan it; ⌖ follows again.
 */
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { addLineArtTiles } from '../afpp/OneBit.jsx';
import { glyphIcon, crumbsLayer } from '../afpp/glyphs.js';
import { toSource } from '../afpp/LocalMap.jsx';
import { fetchDerives } from '../afpp/api.js';
import { AFPP_ENABLED } from '../config/afpp.js';
import { INK, LIT } from '../afpp/palette.js';
import walkSessionService from '../services/walkSessionService.js';
import localStorageService from '../services/localStorageService.js';
import { t } from '../i18n';


export default function FieldMap({ gps, trace, version, playingId, onPlay, focusSession }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef({});
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;

  // ── map ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = elRef.current;
    const map = L.map(el, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, maxZoom: 19 })
      .setView(gps ? [gps.lat, gps.lng] : [8.4388, -75.5865], gps ? 17 : 3);
    addLineArtTiles(map);
    layers.current = {
      mine: L.layerGroup().addTo(map),
      others: L.layerGroup().addTo(map),
      live: L.polyline([], { color: LIT, weight: 3, lineCap: 'square', lineJoin: 'miter' }).addTo(map),
      me: null,
    };
    map.on('dragstart', () => {
      follow.current = false;
      setFollowing(false);
    });
    mapRef.current = map;

    let timer;
    const loadOthers = () => {
      if (!AFPP_ENABLED) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const b = map.getBounds().pad(0.3);
        try {
          const list = await fetchDerives([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
          const mineIds = new Set(walkSessionService.getAllSessions().map((s) => s.sessionId));
          const g = layers.current.others;
          g.clearLayers();
          for (const d of list) {
            if (mineIds.has(d.id)) continue; // your own shared derive is already drawn as yours
            const pts = d.breadcrumbs.map((p) => [p.lat, p.lng]);
            L.polyline(pts, { color: INK, weight: 2, dashArray: '4 6' }).addTo(g);
            crumbsLayer(pts, map)?.addTo(g);
            for (const r of d.recordings.filter((x) => x.audio)) {
              const src = toSource(d, r);
              L.marker([r.lat, r.lng], { icon: glyphIcon('other', 'perma-rec perma-rec--other', '', src.id), title: `${d.alias} · ${src.name}` })
                .on('click', () => onPlayRef.current(src))
                .addTo(g);
            }
          }
        } catch {
          // offline: only your own derives
        }
      }, 400);
    };
    map.on('moveend', loadOthers);
    loadOthers();
    return () => {
      clearTimeout(timer);
      map.remove();
    };
    // gps only seeds the first view
  }, []);

  // ── your saved derives and sounds ────────────────────────────────────────
  useEffect(() => {
    const g = layers.current.mine;
    if (!g) return;
    g.clearLayers();
    for (const s of walkSessionService.getCompletedSessions()) {
      if (s.breadcrumbs?.length > 1) {
        const pts = s.breadcrumbs.map((b) => [b.lat, b.lng]);
        L.polyline(pts, { color: INK, weight: 2, lineCap: 'square' }).addTo(g);
        crumbsLayer(pts, mapRef.current)?.addTo(g);
      }
    }
    for (const r of localStorageService.getAllRecordings()) {
      if (!r.location) continue;
      const m = L.marker([r.location.lat, r.location.lng], {
        icon: glyphIcon('sound', 'perma-rec', r.uniqueId === playingId ? 'is-playing' : '', r.uniqueId),
        title: r.displayName || t('afpp.sound'),
      }).addTo(g);
      m.on('click', async () => {
        const url = (await localStorageService.getPlayableUrl(r.uniqueId))
          || await localStorageService.getAudioBlobFlexible(r.uniqueId).then((b) => (b ? URL.createObjectURL(b) : null));
        if (url) onPlayRef.current({ id: r.uniqueId, name: r.displayName || t('afpp.sound'), alias: t('perma.you'), url, lat: r.location.lat, lng: r.location.lng });
      });
    }
  }, [version, playingId]);

  // ── you + the live trace ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gps) return;
    const ll = [gps.lat, gps.lng];
    if (!layers.current.me) {
      layers.current.me = L.marker(ll, { icon: glyphIcon('me', 'perma-me'), interactive: false, keyboard: false }).addTo(map);
      map.setView(ll, 17);
    } else {
      layers.current.me.setLatLng(ll);
      if (follow.current) map.panTo(ll, { animate: true });
    }
  }, [gps]);

  useEffect(() => {
    layers.current.live?.setLatLngs(trace);
    // Breadcrumbs along the walk in progress (only if the glyph set has a crumb).
    layers.current.liveCrumbs?.remove();
    layers.current.liveCrumbs = mapRef.current ? crumbsLayer(trace, mapRef.current)?.addTo(mapRef.current) : null;
  }, [trace]);

  // ── show one of your derives (from the list) ─────────────────────────────
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
  };

  return (
    <div className="perma-map">
      <div ref={elRef} className="afpp-local__map" />
      <button type="button" className={`afpp-btn perma-recenter ${following ? 'is-lit' : ''}`} onClick={recenter} aria-label={t('perma.recenter')}>
        ⌖
      </button>
    </div>
  );
}

