/**
 * AFPP — the shared global map of SoundWalk derives.
 *
 *   globe  →  click a blinking dot  →  local map (~10 km)  →  click a trace or
 *   a sound to hear it  →  send it to the rings  →  mix sounds from anywhere.
 *
 * This is the whole web front (Vercel) and, inside the APK, the "global map"
 * view. Only reads; publishing happens on the phone (afppShareService.js).
 *
 * When people share derives (SSE) or walk one live (walks.mjs), the globe
 * turns into a tracklog and plays them (GlobeView, tracklog.mjs).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GlobeView from './GlobeView.jsx';
import LocalMap, { toSource } from './LocalMap.jsx';
import RingMixer from './RingMixer.jsx';
import { Mixer } from './mixer.js';
import { OneBitFilter } from './OneBit.jsx';
import ChatPanel from './ChatPanel.jsx';
import Ticker from './Ticker.jsx';
import { fetchActivity, fetchDerives, fetchDerive, subscribe, audioUrl } from './api.js';
import { watchWalks } from './walks.mjs';
import { toTrace, playOrder } from './tracklog.mjs';
import { AFPP_ENABLED, roomsUrl } from '../config/afpp.js';
import { t, getLanguage } from '../i18n';
import './theme.css';
import LangSelect from './LangSelect.jsx';

const MIX_KEY = 'afpp_rings';
const SATELLITES = 12; // the latest shared sounds shown around the rings
const TRACKLOG_KEEP = 12; // shared walks the tracklog keeps to play
const SETTLE_MS = 2500; // a share arrives as a burst (the derive, then each sound): wait for it to settle

function loadMix() {
  try {
    const v = JSON.parse(localStorage.getItem(MIX_KEY) || '[]');
    return Array.isArray(v) ? v.filter((s) => s && s.id && s.url) : [];
  } catch {
    return [];
  }
}

/** `#8.4388,-75.5865` opens the local map there — a link to a place. */
function focusFromHash() {
  const m = /^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(typeof location !== 'undefined' ? location.hash : '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, id: m[0] } : null;
}

function setHash(focus) {
  try {
    history.replaceState(null, '', focus ? `#${focus.lat.toFixed(4)},${focus.lng.toFixed(4)}` : location.pathname + location.search);
  } catch {
    // sandboxed: no deep links, no harm
  }
}

export default function AfppApp({ onExit, web = false }) {
  const [focus, setFocus] = useState(focusFromHash);
  const [view, setView] = useState(() => (focus ? 'map' : 'globe'));
  const [activity, setActivity] = useState([]);
  const [flashes, setFlashes] = useState(() => new Map());
  const [sources, setSources] = useState(loadMix);
  const [ringsOpen, setRingsOpen] = useState(true);
  // On a phone the chat starts folded, so the globe and the rings have room.
  const [chatOpen, setChatOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 820);
  const [satellites, setSatellites] = useState([]); // the latest shared sounds, anywhere
  const [dismissed, setDismissed] = useState(() => new Set());
  const [playing, setPlaying] = useState(null); // preview source
  const [offline, setOffline] = useState(false);
  const mixerRef = useRef(null);
  if (!mixerRef.current) mixerRef.current = new Mixer();
  const previewRef = useRef(null);
  const satTimer = useRef(null);
  const loadSatellitesRef = useRef(null);
  // the tracklog: shared walks [{trace, at}] and live ones (sid → trace)
  const [shared, setShared] = useState([]);
  const [live, setLive] = useState(() => new Map());
  const [tracklog, setTracklog] = useState(false);
  const [listen, setListen] = useState(false);
  const settling = useRef(new Map()); // derive id → timer
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const sharedRef = useRef(shared);
  sharedRef.current = shared;

  // ------------------------------------------------------------ tracklog
  const addShared = useCallback((id, autoplay) => {
    clearTimeout(settling.current.get(id));
    settling.current.set(
      id,
      setTimeout(async () => {
        settling.current.delete(id);
        try {
          const trace = toTrace(await fetchDerive(id));
          setShared((list) => [{ trace, at: Date.now() }, ...list.filter((x) => x.trace.id !== id)].slice(0, TRACKLOG_KEEP));
          if (autoplay) setTracklog(true); // someone just shared: the planet turns into the tracklog
        } catch {
          // gone again, or offline: the dot still blinks
        }
      }, SETTLE_MS),
    );
  }, []);

  // ▶ by hand: what was shared while you were here, else the latest walks on the planet
  const onTracklog = useCallback(async (on) => {
    if (!on) return setTracklog(false);
    if (!sharedRef.current.length) {
      const recent = [...activityRef.current].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)).slice(0, 6);
      const got = await Promise.allSettled(recent.map((d) => fetchDerive(d.id)));
      const list = got.filter((r) => r.status === 'fulfilled').map((r, i) => ({ trace: toTrace(r.value), at: -i }));
      setShared(list);
    }
    setTracklog(true);
  }, []);

  // Live walks: a walker going live turns the planet into the tracklog too.
  useEffect(() => {
    if (!AFPP_ENABLED) return undefined;
    const seen = new Set();
    return watchWalks(roomsUrl(), (map) => {
      setLive(map);
      for (const [sid, tr] of map) {
        if (tr.live && !seen.has(sid)) {
          seen.add(sid);
          setTracklog(true);
        }
      }
    });
  }, []);

  useEffect(() => () => settling.current.forEach((timer) => clearTimeout(timer)), []);

  const tracks = useMemo(() => playOrder(shared, live), [shared, live]);

  // ------------------------------------------------------------ activity
  useEffect(() => {
    if (!AFPP_ENABLED) return undefined;
    let alive = true;
    const load = () =>
      fetchActivity()
        .then((a) => {
          if (!alive) return;
          setActivity(a);
          setOffline(false);
        })
        .catch(() => alive && setOffline(true));
    load();
    const poll = setInterval(load, 120_000); // SSE covers the gaps; this heals missed events
    const close = subscribe({
      onDerive: (dot) => {
        clearTimeout(satTimer.current);
        satTimer.current = setTimeout(() => loadSatellitesRef.current?.(), 2000);
        setActivity((list) => [dot, ...list.filter((d) => d.id !== dot.id)]);
        setFlashes((m) => new Map(m).set(dot.id, Date.now()));
        addShared(dot.id, true);
      },
      onRemove: ({ id }) => {
        setActivity((list) => list.filter((d) => d.id !== id));
        setShared((list) => list.filter((x) => x.trace.id !== id));
      },
    });
    return () => {
      alive = false;
      clearInterval(poll);
      close();
    };
  }, [addShared]);

  useEffect(() => {
    try {
      localStorage.setItem(MIX_KEY, JSON.stringify(sources));
    } catch {
      // private mode: the rings just won't survive a reload
    }
  }, [sources]);

  // ------------------------------------------------------------ preview player
  const play = useCallback((src) => {
    let a = previewRef.current;
    if (!a) {
      a = previewRef.current = new Audio();
      a.addEventListener('ended', () => setPlaying(null));
    }
    if (!src) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.src = src.url;
    a.play().catch(() => setPlaying(null));
    setPlaying(src);
  }, []);

  useEffect(() => () => previewRef.current?.pause(), []);

  // ♪ in the tracklog: each sound plays as the walker reaches it
  const onSound = useCallback(
    (trace, snd) => {
      if (!listen || !snd.audio) return;
      play({ id: `${trace.id}/${snd.id}`, name: snd.name || t('afpp.sound'), alias: trace.alias, lat: snd.lat, lng: snd.lng, url: audioUrl(snd.audio) });
    },
    [listen, play],
  );

  // Follow pasted / back-forward links to a place.
  useEffect(() => {
    const onHash = () => {
      const f = focusFromHash();
      if (f) {
        setFocus(f);
        setView('map');
      } else {
        setView('globe');
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // ── satellites: the latest shared sounds on the planet wait around the rings
  const loadSatellites = useCallback(async () => {
    try {
      const derives = await fetchDerives([-180, -90, 180, 90]);
      const all = [];
      for (const d of derives) {
        for (const r of d.recordings) if (r.audio) all.push({ src: toSource(d, r), t: r.timestamp || d.updatedAt || 0 });
      }
      all.sort((a, b) => b.t - a.t);
      setSatellites(all.slice(0, SATELLITES).map((x) => x.src));
    } catch {
      // offline: only what was sent by hand
    }
  }, []);

  useEffect(() => {
    if (!AFPP_ENABLED) return undefined;
    loadSatellites();
    const id = setInterval(loadSatellites, 300_000);
    return () => clearInterval(id);
  }, [loadSatellites]);
  loadSatellitesRef.current = loadSatellites;

  // What the rings hold: what you sent (first), then the satellites, once each.
  const ringSources = useMemo(() => {
    const seen = new Set();
    return [...sources, ...satellites].filter((s) => {
      if (seen.has(s.id) || dismissed.has(s.id)) return false;
      seen.add(s.id);
      return true;
    }).slice(0, SATELLITES + 6);
  }, [sources, satellites, dismissed]);

  const toMix = useCallback((src) => {
    setSources((list) => (list.some((s) => s.id === src.id) ? list : [...list, src]));
    setRingsOpen(true);
  }, []);

  const select = useCallback((dot) => {
    const f = { lat: dot.lat, lng: dot.lng, id: dot.id };
    setFocus(f);
    setView('map');
    setHash(f);
  }, []);

  if (!AFPP_ENABLED) {
    return (
      <div className="afpp">
        <p className="afpp-center">{t('afpp.notConfigured')}</p>
      </div>
    );
  }

  const base = import.meta.env.BASE_URL;

  return (
    <div className={`afpp ${web ? 'afpp--web' : ''} ${web && chatOpen ? 'has-chat' : ''}`}>
      <OneBitFilter />

      <header className="afpp-head">
        {onExit && (
          <button type="button" className="afpp-btn" onClick={onExit}>
            ← {t('afpp.backToRecorder')}
          </button>
        )}
        <h1 className="afpp-brand">
          <img src={`${base}afpp-wordmark.png`} alt="Alpine Feminist Punk Parade" width="99" height="48" />
          <span className="afpp-brand__sub">
            DERIVA SONORA <span className="afpp-dim">· {t('afpp.title')}</span>
          </span>
        </h1>
        {offline && <span className="afpp-warn">{t('afpp.offline')}</span>}
        {web && (
          <nav className="afpp-links">
            <a href={`${base}?recorder`} title={t('afpp.nav.recordTitle')}>● {t('afpp.nav.record')}</a>
            <a href={`${base}howto/${getLanguage() === 'en' ? '' : `${getLanguage()}/`}`}>{t('afpp.nav.howto')}</a>
            <a className="afpp-wide" href={`${base}bitacora/`}>{t('afpp.nav.bitacora')}</a>
            <a href={`${base}deriva-sonora.apk`} download>
              <span className="afpp-wide">{t('afpp.nav.apk')}</span>
              <span className="afpp-narrow">APK</span> ↓
            </a>
          </nav>
        )}
        <LangSelect />
      </header>

      <Ticker scale={typeof window !== 'undefined' && window.innerWidth < 600 ? 1 : 2} />

      <div className="afpp-split">
        <div className="afpp-stage-col">
          <main className="afpp-main">
            {view === 'globe' || !focus ? (
              <GlobeView
                activity={activity}
                flashes={flashes}
                focus={focus}
                onSelect={select}
                tracks={tracks}
                tracklog={tracklog}
                onTracklog={onTracklog}
                onSound={onSound}
                listen={listen}
                onListen={setListen}
              />
            ) : (
              <LocalMap
                key={focus.id}
                focus={focus}
                playingId={playing?.id}
                mixIds={sources.map((s) => s.id)}
                onPlay={play}
                onToMix={toMix}
                onBack={() => {
                  setView('globe');
                  setHash(null);
                }}
              />
            )}
          </main>

          {playing && (
            <div className="afpp-now">
              <span className="is-lit">▶</span> {playing.alias} · {playing.name}
              <button type="button" className="afpp-btn" onClick={() => toMix(playing)}>
                {t('afpp.map.toRings')}
              </button>
              <button type="button" className="afpp-x" onClick={() => play(null)} aria-label={t('common.close')}>
                ■
              </button>
            </div>
          )}

          <RingMixer
            mixer={mixerRef.current}
            sources={ringSources}
            onRemove={(id) => {
              setSources((list) => list.filter((s) => s.id !== id));
              setDismissed((d) => new Set(d).add(id));
            }}
            open={ringsOpen}
            onToggle={() => setRingsOpen((o) => !o)}
          />
        </div>

        {web && <ChatPanel open={chatOpen} onToggle={() => setChatOpen((o) => !o)} />}
      </div>
    </div>
  );
}
