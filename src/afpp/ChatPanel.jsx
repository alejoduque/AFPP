/**
 * The chat beside the globe: #AFPP, the Alpine Feminist Punk Parade's room.
 * Bridged both ways with the AFPP Telegram group (t.me/alpinefeministpunkparade)
 * by server/afpp's bot, and kept in the AFPP bitácora.
 *
 * The client is public/chat/afpp-chat.js (a fork of iScream's chat.js). It
 * wires itself to these element ids when it loads, so the markup below
 * mirrors that client's and the script is added once, after it exists. Its
 * messages come from window.AFPP_CHAT_STRINGS, refreshed here on every render
 * so a language change reaches it. Transport: Ergo's websocket on
 * reporta.altred.xyz (it lists this site's origin in allowed-origins).
 *
 * Beside IRC, the assembly (public/chat/afpp-assembly.js, with KLAP's shared
 * scripts in public/chat/assembly/): lines carry their typing (TBT) and play
 * back as they were written; with a room relay (VITE_AFPP_ROOMS), the others
 * are seen typing live, and #chat-strip holds voices, video and ascii video.
 */
import React, { useEffect } from 'react';
import { AFPP_API, AFPP_ROOMS_ENABLED, roomsUrl } from '../config/afpp.js';
import { loadAssembly, loadScript } from './assembly.js';
import { t } from '../i18n';

const IRC = import.meta.env.VITE_AFPP_IRC || 'wss://reporta.altred.xyz/irc'; // VITE_AFPP_IRC: a local Ergo, for development
const CHANNEL = '#AFPP';
const CHAT_KEYS = ['connecting', 'cantOpen', 'lost', 'retry', 'nickTaken', 'inAs', 'joinedNote', 'joined', 'left', 'quit', 'nowIs',
  'kicked', 'youKicked', 'topic', 'people1', 'peopleN', 'private', 'closed', 'failed', 'joinFirst', 'commands', 'empty', 'latest',
  // the assembly (afpp-assembly.js)
  'present', 'settings', 'onlyYou', 'hereN', 'roomOffline', 'roomConnecting', 'enableSound', 'micOn', 'micOff', 'muted', 'you',
  'camOff', 'camAscii', 'camVideo', 'asciiAll', 'asciiNote', 'noPermission', 'noDevice', 'writes', 'writing', 'walking'];
let loaded = false;

export default function ChatPanel({ open, onToggle }) {
  window.AFPP_CHAT_STRINGS = Object.fromEntries(CHAT_KEYS.map((k) => [k, t(`afpp.chatjs.${k}`)]));

  useEffect(() => {
    if (loaded) return;
    loaded = true;
    const base = `${import.meta.env.BASE_URL}chat/`;
    loadScript(`${base}afpp-chat.js`);
    // TBT needs only IRC; voices and live typing need the room relay too.
    loadAssembly(AFPP_ROOMS_ENABLED ? undefined : ['tbt'])
      .then(() => loadScript(`${base}afpp-assembly.js`))
      .catch(() => {}); // no assembly: the chat is plain IRC, as before
  }, []);

  return (
    <aside className={`afpp-chat ${open ? 'is-open' : ''}`} aria-label={`Chat ${CHANNEL}`}>
      <header className="afpp-chat__head">
        <button type="button" className="afpp-chat__toggle" onClick={onToggle} aria-expanded={open}>
          <b>{CHANNEL}</b> <span className="afpp-dim">{open ? '▾' : '▴'}</span>
        </button>
        <a href="https://t.me/alpinefeministpunkparade" target="_blank" rel="noopener">
          ✈ {t('afpp.nav.telegram')} ↗
        </a>
        <a href={`${import.meta.env.BASE_URL}bitacora/`}>{t('afpp.nav.bitacora')} ↗</a>
      </header>

      <div className="afpp-chat__body">
        <form className="chat__join" id="chat-join" data-irc={IRC} data-channel={CHANNEL} data-bridge="afpp-bitacora" data-log={`${AFPP_API}/api/bitacora.json`}
          data-rooms={roomsUrl() || undefined} data-ice={AFPP_ROOMS_ENABLED ? `${AFPP_API}/api/ice` : undefined}>
          <label htmlFor="chat-nick" className="afpp-sr">
            {t('afpp.chat.nick')}
          </label>
          <input id="chat-nick" name="nick" maxLength={20} placeholder={t('afpp.chat.nick')} autoComplete="off" autoCapitalize="off" spellCheck="false" />
          <button type="submit" className="afpp-btn">
            {t('afpp.chat.join')}
          </button>
        </form>

        <div className="chat" id="chat" hidden>
          <p className="chat__status" id="chat-status" role="status" aria-live="polite" />
          <div className="live-strip" id="chat-strip" hidden />
          <ol className="chat__log" id="chat-log" aria-live="polite" aria-relevant="additions" />
          <form className="chat__say" id="chat-say">
            <label htmlFor="chat-input" className="afpp-sr">
              {t('afpp.chat.message')}
            </label>
            <input id="chat-input" maxLength={400} placeholder={t('afpp.chat.placeholder')} autoComplete="off" enterKeyHint="send" />
            <button type="submit" className="afpp-btn">
              {t('afpp.chat.send')}
            </button>
          </form>
        </div>

        <p className="afpp-chat__note afpp-dim">{t('afpp.chat.note')}</p>
      </div>
    </aside>
  );
}
