/**
 * AFPP · Deriva Sonora: one app, in a browser and in the APK alike.
 *
 *   the stage     the planet (GlobeView) zoomed out; zoom in, click a dot or
 *                 ⌖ and it becomes the street map (WalkMap), where you listen
 *                 and where you walk. Zooming the map out gives the planet
 *                 back (stage.mjs keeps the scale across the switch).
 *   the bar       ⌖ here / ◯ planet · ● record · ▶ derive (◍ live) · ≡ derives
 *   the chat      #AFPP, with its assembly (ChatPanel)
 *   the rings     sounds from anywhere, mixed (RingMixer)
 *
 * When people share derives (SSE) or walk one live (walks.mjs), the planet
 * turns into a tracklog (GlobeView, tracklog.mjs); someone on the street map
 * gets a line to go and watch instead, so a walk is never interrupted.
 *
 * GPS and the alias are asked for when they are needed (⌖, ●, ▶), not on
 * arrival; the APK starts its GPS at once and asks for the alias on first run.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GlobeView from './GlobeView.jsx';
import WalkMap, { toSource, zoomForKm } from './WalkMap.jsx';
import RingMixer from './RingMixer.jsx';
import { Mixer } from './mixer.js';
import { OneBitFilter } from './OneBit.jsx';
import ChatPanel from './ChatPanel.jsx';
import Ticker from './Ticker.jsx';
import { fetchActivity, fetchDerives, fetchDerive, subscribe, audioUrl } from './api.js';
import { watchWalks } from './walks.mjs';
import { toTrace, playOrder } from './tracklog.mjs';
import { soundsLabel } from './format.js';
import { AFPP_ENABLED, AFPP_ROOMS_ENABLED, roomsUrl } from '../config/afpp.js';
import useField from '../perma/useField.js';
import MyDerives from '../perma/MyDerives.jsx';
import { AliasSheet, SaveSheet, EndSheet, SharePrompt, LiveSheet, fmtTime } from '../perma/Sheets.jsx';
import { LiveWalk } from '../perma/liveWalk.js';
import userAliasService from '../services/userAliasService.js';
import walkSessionService from '../services/walkSessionService.js';
import breadcrumbService from '../services/breadcrumbService.js';
import { safeId } from '../services/afppShareService.js';
import { t, getLanguage } from '../i18n';
import './theme.css';
import '../perma/perma.css';
import LangSelect from './LangSelect.jsx';

const MIX_KEY = 'afpp_rings';
const SATELLITES = 12; // the latest shared sounds shown around the rings
const TRACKLOG_KEEP = 12; // shared walks the tracklog keeps to play
const SETTLE_MS = 2500; // a share arrives as a burst (the derive, then each sound): wait for it to settle
const HERE_ZOOM = 17;

function loadMix() {
  try {
    const v = JSON.parse(localStorage.getItem(MIX_KEY) || '[]');
    return Array.isArray(v) ? v.filter((s) => s && s.id && s.url) : [];
  } catch {
    return [];
  }
}

/** `#8.4388,-75.5865` opens the street map there: a link to a place. */
function focusFromHash() {
  const m = /^#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(typeof location !== 'undefined' ? location.hash : '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function setHash(place) {
  try {
    history.replaceState(null, '', place ? `#${place.lat.toFixed(4)},${place.lng.toFixed(4)}` : location.pathname + location.search.replace(/[?&]recorder\b/, ''));
  } catch {
    // sandboxed: no deep links, no harm
  }
}

/** About 10 km across, at most street level. */
const placeZoom = (lat) => Math.min(HERE_ZOOM, zoomForKm(lat, typeof window === 'undefined' ? 800 : window.innerWidth));

function Clock({ since }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <>{fmtTime((Date.now() - since) / 1000)}</>;
}

export default function AfppApp({ native = false }) {
  const [stage, setStage] = useState(() => {
    const f = focusFromHash();
    return f ? { view: 'map', center: [f.lat, f.lng], zoom: placeZoom(f.lat), follow: false, key: 1 } : { view: 'planet', key: 1 };
  });
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const [activity, setActivity] = useState([]);
  const [flashes, setFlashes] = useState(() => new Map());
  const [sources, setSources] = useState(loadMix);
  const wide = typeof window === 'undefined' || window.innerWidth >= 820;
  // The rings start folded: the stage comes first. Sending them a sound opens them.
  const [ringsOpen, setRingsOpen] = useState(false);
  // On a phone the chat starts folded, so the stage and the bar have room.
  const [chatOpen, setChatOpen] = useState(wide);
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
  const [watch, setWatch] = useState(null); // on the street map: {text} of a share or live walk to go and see
  const settling = useRef(new Map()); // derive id → timer
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  // the field
  const field = useField({ autoGps: native });
  const [needAlias, setNeedAlias] = useState(() => native && !userAliasService.hasAlias());
  const afterAlias = useRef(null);
  const pending = useRef(null); // locate | record | derive, waiting for a GPS fix
  const autoLocate = useRef(native); // the APK goes to you on the first fix, until you move the stage yourself
  const [panel, setPanel] = useState(null); // 'derives'
  const [ending, setEnding] = useState(false);
  const [sharePrompt, setSharePrompt] = useState(null);
  const [focusSession, setFocusSession] = useState(null);
  const [notice, setNotice] = useState(null);
  const myLiveRef = useRef(null); // the LiveWalk while your derive is ◍ live
  const [myLive, setMyLive] = useState(null); // {status, voice}
  const [liveSheet, setLiveSheet] = useState(false);

  const say = useCallback((msg) => {
    setNotice(msg);
    setTimeout(() => setNotice((m) => (m === msg ? null : m)), 4000);
  }, []);

  // ------------------------------------------------------------ the stage
  const goMap = useCallback(({ lat, lng, zoom, follow = false }) => {
    setStage((s) => ({ view: 'map', center: [lat, lng], zoom: zoom ?? placeZoom(lat), follow, key: s.key + 1 }));
    setHash({ lat, lng });
  }, []);

  const goPlanet = useCallback((from = null) => {
    setStage((s) => ({ view: 'planet', from, key: s.key + 1 }));
    setHash(null);
  }, []);

  const byHand = (fn) => (...args) => {
    autoLocate.current = false;
    return fn(...args);
  };

  const goHere = useCallback(() => {
    const g = field.gps;
    if (g) goMap({ lat: g.lat, lng: g.lng, zoom: HERE_ZOOM, follow: true });
  }, [field.gps, goMap]);

  // Follow pasted / back-forward links to a place.
  useEffect(() => {
    const onHash = () => {
      const f = focusFromHash();
      if (f) goMap(f);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [goMap]);

  // ------------------------------------------------------------ tracklog
  // A share or a live walk: on the planet it plays; on the street map it waits for you.
  const cue = useCallback((text) => {
    if (stageRef.current.view === 'planet') setTracklog(true);
    else setWatch({ text });
  }, []);

  const addShared = useCallback((id, autoplay) => {
    clearTimeout(settling.current.get(id));
    settling.current.set(
      id,
      setTimeout(async () => {
        settling.current.delete(id);
        try {
          const trace = toTrace(await fetchDerive(id));
          setShared((list) => [{ trace, at: Date.now() }, ...list.filter((x) => x.trace.id !== id)].slice(0, TRACKLOG_KEEP));
          if (autoplay) cue(t('afpp.track.sharedNow', { alias: trace.alias, title: trace.title ? `«${trace.title}»` : '' }));
        } catch {
          // gone again, or offline: the dot still blinks
        }
      }, SETTLE_MS),
    );
  }, [cue]);

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

  const goWatch = () => {
    setWatch(null);
    autoLocate.current = false;
    goPlanet();
    setTracklog(true);
  };

  // Live walks: a walker going live turns the planet into the tracklog too.
  useEffect(() => {
    if (!AFPP_ENABLED) return undefined;
    const seen = new Set();
    return watchWalks(roomsUrl(), (map) => {
      setLive(map);
      for (const [sid, tr] of map) {
        if (tr.live && !seen.has(sid)) {
          seen.add(sid);
          cue(t('afpp.track.walkingNow', { alias: tr.alias }));
        }
      }
    });
  }, [cue]);

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

  // ------------------------------------------------------------ the field
  const doAction = useCallback(async (action) => {
    const g = field.gps;
    if (!g) return;
    const s = stageRef.current;
    if (s.view !== 'map' || !s.follow) goMap({ lat: g.lat, lng: g.lng, zoom: HERE_ZOOM, follow: true });
    if (action === 'record') {
      play(null);
      try {
        await field.record();
      } catch (e) {
        say(e.message === 'nogps' ? t('perma.err.nogps') : t('perma.err.rec', { msg: e.message }));
      }
    } else if (action === 'derive') {
      await field.startDerive();
    }
  }, [field, goMap, play, say]);

  /** Run now with a GPS fix, or once the first fix arrives. */
  const withGps = useCallback((action) => {
    autoLocate.current = false;
    if (field.gps) return doAction(action);
    pending.current = action;
    field.startGps();
    say(t('perma.gps.waiting'));
  }, [field, doAction, say]);

  /** Walking needs an alias (it signs what you share): asked the first time. */
  const withAlias = (fn) => {
    if (userAliasService.hasAlias()) return fn();
    afterAlias.current = fn;
    setNeedAlias(true);
  };

  useEffect(() => {
    if (!field.gps) return;
    if (pending.current) {
      const action = pending.current;
      pending.current = null;
      doAction(action);
    } else if (autoLocate.current) {
      autoLocate.current = false;
      goHere();
    }
  }, [field.gps, doAction, goHere]);

  useEffect(() => {
    if (field.gpsState === 'denied' && pending.current) {
      pending.current = null;
      say(t('perma.err.nogps'));
    }
  }, [field.gpsState, say]);

  const onMic = async () => {
    if (field.recording) {
      try {
        await field.stop();
      } catch (e) {
        say(t('perma.err.rec', { msg: e.message }));
      }
      return;
    }
    withAlias(() => withGps('record'));
  };

  const onDeriveButton = () => {
    if (field.derive) setEnding(true);
    else withAlias(() => withGps('derive'));
  };

  const onHereOrPlanet = () => {
    autoLocate.current = false;
    if (stage.view === 'map') return goPlanet();
    if (field.gps) return goHere();
    withGps('locate');
  };

  // ◍ live: the derive streamed while it is walked
  useEffect(() => {
    myLiveRef.current?.feed(field.gps);
  }, [field.gps]);
  useEffect(() => () => myLiveRef.current?.stop(), []);

  const goLive = async ({ voice }) => {
    setLiveSheet(false);
    const s = walkSessionService.getActiveSession();
    if (!s || myLiveRef.current) return;
    const lw = new LiveWalk({
      sid: safeId(s.sessionId), // the id it gets if shared at the end: the globe swaps one for the other
      alias: s.userAlias || userAliasService.getAlias(),
      title: s.title || '',
      start: typeof s.startTime === 'number' ? s.startTime : Date.parse(s.startTime) || Date.now(),
      onStatus: (status) => setMyLive((l) => l && { ...l, status }),
    });
    breadcrumbService.getCurrentBreadcrumbs().forEach((b) => lw.feed(b));
    myLiveRef.current = lw;
    setMyLive({ status: 'connecting', voice: false });
    if (voice) {
      try {
        await lw.setVoice(true);
        setMyLive((l) => l && { ...l, voice: true });
      } catch (e) {
        say(t('afpp.live.noMic', { msg: e.message }));
      }
    }
  };

  const stopLive = (ended) => {
    if (ended) myLiveRef.current?.end();
    else myLiveRef.current?.stop();
    myLiveRef.current = null;
    setMyLive(null);
  };

  const endDerive = (title) => {
    setEnding(false);
    stopLive(true);
    const done = field.endDerive(title);
    if (done && done.recordingIds?.length && AFPP_ENABLED) setSharePrompt(done);
  };

  // ------------------------------------------------------------ render
  if (!AFPP_ENABLED && !native) {
    return (
      <div className="afpp">
        <p className="afpp-center">{t('afpp.notConfigured')}</p>
      </div>
    );
  }

  const base = import.meta.env.BASE_URL;
  const activeSounds = field.derive ? walkSessionService.getActiveSession()?.recordingIds?.length || 0 : 0;
  // A fix younger than 30 s counts, even if the watch reported a passing error since.
  const gpsFresh = field.gps && Date.now() - (field.gps.timestamp || Date.now()) < 30000;
  const gpsLabel = field.gpsState === 'off' ? null
    : gpsFresh ? `±${Math.round(field.gps.accuracy || 0)} m`
      : field.gpsState === 'denied' || field.gpsError ? t('perma.gps.none') : t('perma.gps.wait');
  const onMap = stage.view === 'map';

  return (
    <div className={`afpp perma ${native ? '' : 'afpp--web'} ${AFPP_ENABLED && chatOpen ? 'has-chat' : ''}`}>
      <OneBitFilter />

      <header className="afpp-head">
        <h1 className="afpp-brand">
          <img src={`${base}afpp-wordmark.png`} alt="Alpine Feminist Punk Parade" width="99" height="48" />
          <span className="afpp-brand__sub">
            DERIVA SONORA <span className="afpp-dim afpp-wide">· {t('afpp.title')}</span>
          </span>
        </h1>
        {offline && <span className="afpp-warn">{t('afpp.offline')}</span>}
        {gpsLabel && <span className={`perma-gps ${gpsFresh ? '' : 'afpp-warn'}`}>⌖ {gpsLabel}</span>}
        {!native && (
          <nav className="afpp-links">
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
            {!onMap ? (
              <GlobeView
                key={stage.key}
                from={stage.from}
                activity={activity}
                flashes={flashes}
                onSelect={byHand((d) => goMap({ lat: d.lat, lng: d.lng }))}
                onZoomIn={byHand(({ lat, lng, zoom }) => goMap({ lat, lng, zoom }))}
                tracks={tracks}
                tracklog={tracklog}
                onTracklog={onTracklog}
                onSound={onSound}
                listen={listen}
                onListen={setListen}
              />
            ) : (
              <WalkMap
                key={stage.key}
                center={stage.center}
                zoom={stage.zoom}
                follow={stage.follow}
                gps={field.gps}
                trace={field.trace}
                version={field.version}
                live={live}
                playingId={playing?.id}
                mixIds={sources.map((s) => s.id)}
                onPlay={play}
                onToMix={toMix}
                onPlanet={byHand((from) => goPlanet(from))}
                onLocate={() => withGps('locate')}
                focusSession={focusSession}
              />
            )}

            {(field.derive || onMap) && (
              <p className={`perma-status ${onMap ? '' : 'perma-status--top'}`}>
                {field.derive ? (
                  <>
                    <span className="is-lit">● {t('perma.status.derive')}</span> <Clock since={field.derive.startTime} /> ·{' '}
                    {soundsLabel(activeSounds)}
                    {AFPP_ROOMS_ENABLED && (
                      <button
                        type="button"
                        className={`perma-live ${myLive ? 'is-on' : ''} ${myLive && myLive.status !== 'live' ? 'is-waiting' : ''}`}
                        aria-pressed={!!myLive}
                        onClick={() => (myLive ? stopLive(false) : setLiveSheet(true))}
                      >
                        ◍ {myLive ? t('afpp.live.on') : t('afpp.live.go')}
                        {myLive?.voice ? ' ♪' : ''}
                      </button>
                    )}
                  </>
                ) : (
                  <span className="afpp-dim">{t('perma.status.idle')}</span>
                )}
              </p>
            )}
            {notice && <p className="perma-notice">{notice}</p>}
            {watch && (
              <p className="afpp-watch">
                <span className="is-lit">◍</span> {watch.text}{' '}
                <button type="button" className="afpp-btn" onClick={goWatch}>
                  {t('afpp.track.watch')}
                </button>
                <button type="button" className="afpp-x" onClick={() => setWatch(null)} aria-label={t('common.close')}>
                  ×
                </button>
              </p>
            )}
            {panel === 'derives' && (
              <MyDerives
                onClose={() => setPanel(null)}
                onShow={(id) => {
                  const s = walkSessionService.getSession(id);
                  const p = s?.breadcrumbs?.[0];
                  setPanel(null);
                  setFocusSession({ id, at: Date.now() });
                  autoLocate.current = false;
                  if (p) goMap({ lat: p.lat, lng: p.lng, zoom: 15 });
                }}
                onChanged={field.refresh}
              />
            )}
          </main>

          {playing && (
            <div className="afpp-now">
              <span className="is-lit">▶</span> {playing.alias} · {playing.name}
              {playing.url && !String(playing.id).startsWith('recording-') && (
                <button type="button" className="afpp-btn" onClick={() => toMix(playing)}>
                  {t('afpp.map.toRings')}
                </button>
              )}
              <button type="button" className="afpp-x" onClick={() => play(null)} aria-label={t('common.close')}>
                ■
              </button>
            </div>
          )}

          {AFPP_ENABLED && (
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
          )}
        </div>

        {AFPP_ENABLED && <ChatPanel open={chatOpen} onToggle={() => setChatOpen((o) => !o)} />}
      </div>

      <nav className="perma-bar">
        <button type="button" className="afpp-btn perma-bar__side" onClick={onHereOrPlanet}>
          {onMap ? (
            <>
              ◯<span>{t('perma.nav.planet')}</span>
            </>
          ) : (
            <>
              ⌖<span>{t('perma.nav.here')}</span>
            </>
          )}
        </button>
        <div className="perma-bar__center">
          <button
            type="button"
            className={`perma-mic ${field.recording ? 'is-rec' : ''}`}
            onClick={onMic}
            disabled={!!field.take}
            aria-label={field.recording ? t('perma.mic.stop') : t('perma.mic.rec')}
          >
            {field.recording ? (
              <>
                ■ <Clock since={field.recording.since} />
              </>
            ) : (
              <>● {t('perma.mic.rec')}</>
            )}
          </button>
          <button type="button" className="afpp-btn perma-derive" onClick={onDeriveButton} disabled={!!field.recording}>
            {field.derive ? `■ ${t('perma.derive.end')}` : `▶ ${t('perma.derive.start')}`}
          </button>
        </div>
        <button type="button" className="afpp-btn perma-bar__side" onClick={() => setPanel(panel === 'derives' ? null : 'derives')}>
          ≡<span>{t('perma.nav.list')}</span>
        </button>
      </nav>

      {needAlias && (
        <AliasSheet
          onDone={() => {
            setNeedAlias(false);
            const next = afterAlias.current;
            afterAlias.current = null;
            next?.();
          }}
        />
      )}
      {field.take && (
        <SaveSheet
          take={field.take}
          onSave={async (meta) => {
            const saved = await field.saveTake(meta);
            myLiveRef.current?.sound(saved);
            say(t('perma.take.saved'));
          }}
          onDiscard={field.discardTake}
        />
      )}
      {ending && <EndSheet onEnd={endDerive} onCancel={() => setEnding(false)} />}
      {liveSheet && <LiveSheet onGo={goLive} onCancel={() => setLiveSheet(false)} />}
      {sharePrompt && <SharePrompt session={sharePrompt} onClose={() => setSharePrompt(null)} />}
    </div>
  );
}
