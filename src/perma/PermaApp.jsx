/**
 * Deriva Sonora: the field app (Android). Permasoftware 1-bit, three tones.
 *
 *   splash → (alias, first run) → field: the map, the derive, the microphone
 *                                → derives: yours, share / see / delete
 *                                → globe: everyone's derives, the rings (AfppApp)
 *
 * Built on SoundWalk's engines (GPS, trace, storage) but none of its screens.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import useField from './useField.js';
import FieldMap from './FieldMap.jsx';
import MyDerives from './MyDerives.jsx';
import { AliasSheet, SaveSheet, EndSheet, SharePrompt, LiveSheet, fmtTime } from './Sheets.jsx';
import { LiveWalk } from './liveWalk.js';
import AfppApp from '../afpp/AfppApp.jsx';
import { OneBitFilter } from '../afpp/OneBit.jsx';
import Ticker from '../afpp/Ticker.jsx';
import { AFPP_ENABLED, AFPP_ROOMS_ENABLED } from '../config/afpp.js';
import userAliasService from '../services/userAliasService.js';
import walkSessionService from '../services/walkSessionService.js';
import breadcrumbService from '../services/breadcrumbService.js';
import { safeId } from '../services/afppShareService.js';
import { t } from '../i18n';
import '../afpp/theme.css';
import './perma.css';
import { soundsLabel } from '../afpp/format.js';
import LangSelect from '../afpp/LangSelect.jsx';

const SPLASH_MS = 1400;

function Splash() {
  return (
    <div className="perma-splash" aria-label="Deriva Sonora">
      <img src={`${import.meta.env.BASE_URL}deriva-splash.png`} alt="Deriva Sonora" />
    </div>
  );
}

function Clock({ since }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <>{fmtTime((Date.now() - since) / 1000)}</>;
}

export default function PermaApp() {
  const [splash, setSplash] = useState(true);
  const [view, setView] = useState('field'); // field | list | globe
  const [needAlias, setNeedAlias] = useState(() => !userAliasService.hasAlias());
  const [ending, setEnding] = useState(false);
  const [sharePrompt, setSharePrompt] = useState(null);
  const [focusSession, setFocusSession] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [notice, setNotice] = useState(null);
  const audioRef = useRef(null);
  const field = useField();
  const liveRef = useRef(null); // the LiveWalk while this derive is ◍ live
  const [live, setLive] = useState(null); // {status, voice}
  const [liveSheet, setLiveSheet] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSplash(false), SPLASH_MS);
    return () => clearTimeout(id);
  }, []);

  const say = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice((m) => (m === msg ? null : m)), 4000);
  };

  // ── preview player (your sounds and others' near you) ────────────────────
  const play = useCallback((src) => {
    let a = audioRef.current;
    if (!a) {
      a = audioRef.current = new Audio();
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

  useEffect(() => () => audioRef.current?.pause(), []);

  // ── ◍ live: the derive streamed while it is walked ──────────────────────
  useEffect(() => {
    liveRef.current?.feed(field.gps);
  }, [field.gps]);
  useEffect(() => () => liveRef.current?.stop(), []);

  const goLive = async ({ voice }) => {
    setLiveSheet(false);
    const s = walkSessionService.getActiveSession();
    if (!s || liveRef.current) return;
    const lw = new LiveWalk({
      sid: safeId(s.sessionId), // the id it gets if shared at the end: the globe swaps one for the other
      alias: s.userAlias || userAliasService.getAlias(),
      title: s.title || '',
      start: typeof s.startTime === 'number' ? s.startTime : Date.parse(s.startTime) || Date.now(),
      onStatus: (status) => setLive((l) => l && { ...l, status }),
    });
    breadcrumbService.getCurrentBreadcrumbs().forEach((b) => lw.feed(b));
    liveRef.current = lw;
    setLive({ status: 'connecting', voice: false });
    if (voice) {
      try {
        await lw.setVoice(true);
        setLive((l) => l && { ...l, voice: true });
      } catch (e) {
        say(t('afpp.live.noMic', { msg: e.message }));
      }
    }
  };

  const stopLive = (ended) => {
    if (ended) liveRef.current?.end();
    else liveRef.current?.stop();
    liveRef.current = null;
    setLive(null);
  };

  // ── the microphone ───────────────────────────────────────────────────────
  const onMic = async () => {
    if (field.recording) {
      try {
        await field.stop();
      } catch (e) {
        say(t('perma.err.rec', { msg: e.message }));
      }
      return;
    }
    play(null);
    try {
      await field.record();
    } catch (e) {
      say(e.message === 'nogps' ? t('perma.err.nogps') : t('perma.err.rec', { msg: e.message }));
    }
  };

  const onDeriveButton = async () => {
    if (field.derive) setEnding(true);
    else if (!field.gps) say(t('perma.err.nogps'));
    else await field.startDerive();
  };

  const endDerive = (title) => {
    setEnding(false);
    stopLive(true);
    const done = field.endDerive(title);
    if (done && done.recordingIds?.length && AFPP_ENABLED) setSharePrompt(done);
  };

  if (splash) return <Splash />;

  if (view === 'globe') {
    return (
      <div className="perma-globe">
        <AfppApp onExit={() => setView('field')} />
      </div>
    );
  }

  const activeSounds = field.derive ? walkSessionService.getActiveSession()?.recordingIds?.length || 0 : 0;
  // A fix younger than 30 s counts, even if the watch reported a passing error since.
  const gpsFresh = field.gps && Date.now() - (field.gps.timestamp || Date.now()) < 30000;
  const gpsLabel = gpsFresh ? `±${Math.round(field.gps.accuracy || 0)} m` : field.gpsError ? t('perma.gps.none') : t('perma.gps.wait');

  return (
    <div className="afpp perma">
      <OneBitFilter />
      <header className="afpp-head">
        <h1 className="afpp-brand">
          <img src={`${import.meta.env.BASE_URL}afpp-wordmark.png`} alt="Alpine Feminist Punk Parade" width="74" height="36" />
          <span className="afpp-brand__sub">DERIVA SONORA</span>
        </h1>
        <span className={`perma-gps ${gpsFresh ? '' : 'afpp-warn'}`}>⌖ {gpsLabel}</span>
        <LangSelect />
      </header>

      <Ticker scale={1} />
      <main className="afpp-main">
        <FieldMap
          gps={field.gps}
          trace={field.trace}
          version={field.version}
          playingId={playing?.id}
          onPlay={play}
          focusSession={focusSession}
        />
        <p className="perma-status">
          {field.derive ? (
            <>
              <span className="is-lit">● {t('perma.status.derive')}</span> <Clock since={field.derive.startTime} /> ·{' '}
              {soundsLabel(activeSounds)}
              {AFPP_ROOMS_ENABLED && (
                <button
                  type="button"
                  className={`perma-live ${live ? 'is-on' : ''} ${live && live.status !== 'live' ? 'is-waiting' : ''}`}
                  aria-pressed={!!live}
                  onClick={() => (live ? stopLive(false) : setLiveSheet(true))}
                >
                  ◍ {live ? t('afpp.live.on') : t('afpp.live.go')}
                  {live?.voice ? ' ♪' : ''}
                </button>
              )}
            </>
          ) : (
            <span className="afpp-dim">{t('perma.status.idle')}</span>
          )}
        </p>
        {notice && <p className="perma-notice">{notice}</p>}
        {view === 'list' && (
          <MyDerives
            onClose={() => setView('field')}
            onShow={(id) => {
              setFocusSession({ id, at: Date.now() });
              setView('field');
            }}
            onChanged={field.refresh}
          />
        )}
      </main>

      {playing && (
        <div className="afpp-now">
          <span className="is-lit">▶</span> {playing.alias} · {playing.name}
          <button type="button" className="afpp-x" onClick={() => play(null)} aria-label={t('common.close')}>
            ■
          </button>
        </div>
      )}

      <nav className="perma-bar">
        <button type="button" className="afpp-btn perma-bar__side" onClick={() => setView('globe')} disabled={!AFPP_ENABLED}>
          ◯<span>{t('perma.nav.globe')}</span>
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
        <button type="button" className="afpp-btn perma-bar__side" onClick={() => setView(view === 'list' ? 'field' : 'list')}>
          ≡<span>{t('perma.nav.list')}</span>
        </button>
      </nav>

      {needAlias && <AliasSheet onDone={() => setNeedAlias(false)} />}
      {field.take && (
        <SaveSheet
          take={field.take}
          onSave={async (meta) => {
            const saved = await field.saveTake(meta);
            liveRef.current?.sound(saved);
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
