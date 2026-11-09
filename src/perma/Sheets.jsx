/**
 * The bottom sheets of the field screen, 1-bit: alias, save a take, end the
 * derive, the share control (opt-in, with a one-time consent note), and
 * going live with a derive.
 */
import React, { useState } from 'react';
import afppShareService from '../services/afppShareService.js';
import userAliasService from '../services/userAliasService.js';
import { t } from '../i18n';
import Checks from '../afpp/Checks.jsx';
import { SOUNDSCAPE, CONTENT } from '../afpp/layers.mjs';

export const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function Sheet({ title, children, onClose }) {
  return (
    <div className="perma-sheet" role="dialog" aria-label={title}>
      <header>
        <b>{title}</b>
        {onClose && (
          <button type="button" className="afpp-x" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        )}
      </header>
      {children}
    </div>
  );
}

export function AliasSheet({ onDone }) {
  const [alias, setAlias] = useState('');
  const save = (value) => {
    if (value.trim()) userAliasService.setAlias(value.trim());
    else userAliasService.setAlias('anon');
    onDone();
  };
  return (
    <Sheet title={t('perma.alias.title')}>
      <p className="afpp-dim">{t('perma.alias.body')}</p>
      <input
        className="perma-input"
        value={alias}
        maxLength={40}
        autoFocus
        placeholder={t('perma.alias.placeholder')}
        onChange={(e) => setAlias(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save(alias)}
      />
      <div className="perma-row">
        <button type="button" className="afpp-btn" onClick={() => save('')}>
          {t('perma.alias.skip')}
        </button>
        <button type="button" className="afpp-btn perma-primary" onClick={() => save(alias)}>
          {t('perma.ok')}
        </button>
      </div>
    </Sheet>
  );
}

export function SaveSheet({ take, onSave, onDiscard }) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [scape, setScape] = useState([]);
  const [content, setContent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    setBusy(true);
    try {
      await onSave({ name, notes, tags: [...scape, ...content] });
    } catch (e) {
      setError(e.message === 'nogps' ? t('perma.err.nogps') : e.message);
      setBusy(false);
    }
  };
  return (
    <Sheet title={`${t('perma.take.title')} · ${fmtTime(take.durationSec)}`}>
      <input
        className="perma-input"
        value={name}
        maxLength={120}
        placeholder={t('perma.take.name')}
        onChange={(e) => setName(e.target.value)}
      />
      <Checks legend={t('layers.soundscape')} options={SOUNDSCAPE.map((v) => [v, t(`tag.${v}`)])} value={scape} onChange={setScape} />
      <Checks legend={t('layers.content')} options={CONTENT.map((v) => [v, t(`tag.${v}`)])} value={content} onChange={setContent} />
      <textarea
        className="perma-input"
        rows={2}
        value={notes}
        maxLength={500}
        placeholder={t('perma.take.notes')}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error && <p className="afpp-warn">{error}</p>}
      <div className="perma-row">
        <button type="button" className="afpp-btn" onClick={onDiscard} disabled={busy}>
          {t('perma.take.discard')}
        </button>
        <button type="button" className="afpp-btn perma-primary" onClick={save} disabled={busy}>
          {t('perma.take.save')}
        </button>
      </div>
    </Sheet>
  );
}

export function EndSheet({ onEnd, onCancel }) {
  const [title, setTitle] = useState('');
  return (
    <Sheet title={t('perma.end.title')} onClose={onCancel}>
      <input
        className="perma-input"
        value={title}
        maxLength={120}
        autoFocus
        placeholder={t('perma.end.placeholder')}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnd(title)}
      />
      <div className="perma-row">
        <button type="button" className="afpp-btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="button" className="afpp-btn perma-primary" onClick={() => onEnd(title)}>
          ■ {t('perma.end.confirm')}
        </button>
      </div>
    </Sheet>
  );
}

/** Share / unshare one derive. Opt-in; the first time it explains what becomes public. */
export function ShareControl({ sessionId, onChange }) {
  const [shared, setShared] = useState(() => afppShareService.isShared(sessionId));
  const [stage, setStage] = useState('idle'); // idle | consent | busy | confirm
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState(null);

  if (!afppShareService.enabled) return null;

  const share = async () => {
    setStage('busy');
    setMessage(null);
    try {
      const { failed } = await afppShareService.shareDerive(sessionId, (done, total) => setProgress(`${done}/${total}`));
      setShared(true);
      setMessage(failed.length ? t('afpp.share.partial', { n: failed.length }) : t('afpp.share.done'));
      onChange?.(true);
    } catch (e) {
      setMessage(t('afpp.share.failed', { error: e.message }));
    }
    setProgress(null);
    setStage('idle');
  };

  const unshare = async () => {
    setStage('busy');
    try {
      await afppShareService.unshareDerive(sessionId);
      setShared(false);
      setMessage(t('afpp.share.removed'));
      onChange?.(false);
    } catch (e) {
      setMessage(t('afpp.share.failed', { error: e.message }));
    }
    setStage('idle');
  };

  return (
    <div className="perma-share">
      {stage === 'consent' ? (
        <>
          <p>{t('afpp.share.consent')}</p>
          <div className="perma-row">
            <button type="button" className="afpp-btn" onClick={() => setStage('idle')}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="afpp-btn perma-primary"
              onClick={() => {
                afppShareService.giveConsent();
                share();
              }}
            >
              {t('afpp.share.agree')}
            </button>
          </div>
        </>
      ) : stage === 'confirm' ? (
        <div className="perma-row">
          <span>{t('afpp.share.confirmUnshare')}</span>
          <button type="button" className="afpp-btn" onClick={unshare}>
            {t('common.yes')}
          </button>
          <button type="button" className="afpp-btn" onClick={() => setStage('idle')}>
            {t('common.no')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`afpp-btn ${shared ? 'is-shared' : ''}`}
          disabled={stage === 'busy'}
          onClick={() => {
            if (shared) setStage('confirm');
            else if (!afppShareService.hasConsent()) setStage('consent');
            else share();
          }}
        >
          ◍ {stage === 'busy' ? `… ${progress || ''}` : shared ? t('afpp.share.shared') : t('afpp.share.share')}
        </button>
      )}
      {message && <p className="afpp-dim">{message}</p>}
    </div>
  );
}

/**
 * ◍ live: stream this derive while walking it (liveWalk.js). Asked each time,
 * since it says where you are right now; the microphone is a second choice.
 */
export function LiveSheet({ onGo, onCancel }) {
  const [voice, setVoice] = useState(false);
  return (
    <Sheet title={t('afpp.live.title')} onClose={onCancel}>
      <p className="afpp-dim">{t('afpp.live.consent')}</p>
      <label className="perma-check">
        <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> {t('afpp.live.voice')}
      </label>
      {voice && <p className="afpp-dim">{t('afpp.live.voiceNote')}</p>}
      <div className="perma-row">
        <button type="button" className="afpp-btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="button" className="afpp-btn perma-primary" onClick={() => onGo({ voice })}>
          ◍ {t('afpp.live.go')}
        </button>
      </div>
    </Sheet>
  );
}

export function SharePrompt({ session, onClose }) {
  return (
    <Sheet title={t('afpp.share.promptTitle')} onClose={onClose}>
      <p className="afpp-dim">{t('afpp.share.promptBody')}</p>
      <ShareControl sessionId={session.sessionId} />
      <div className="perma-row">
        <button type="button" className="afpp-btn" onClick={onClose}>
          {t('afpp.share.later')}
        </button>
      </div>
    </Sheet>
  );
}

export default Sheet;
