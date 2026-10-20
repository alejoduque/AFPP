/**
 * Your derives: newest first, each with its length, sounds, share state,
 * "see on the map" and delete (with confirmation; the sounds go too).
 */
import React, { useState } from 'react';
import walkSessionService from '../services/walkSessionService.js';
import localStorageService from '../services/localStorageService.js';
import afppShareService from '../services/afppShareService.js';
import { ShareControl, fmtTime } from './Sheets.jsx';
import { t, formatDate } from '../i18n';
import { soundsLabel } from '../afpp/format.js';

const km = (m) => (!m ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export default function MyDerives({ onShow, onClose, onChanged }) {
  const [list, setList] = useState(() => walkSessionService.getCompletedSessions().slice().reverse());
  const [confirm, setConfirm] = useState(null);

  const remove = async (s) => {
    if (afppShareService.isShared(s.sessionId)) {
      try {
        await afppShareService.unshareDerive(s.sessionId);
      } catch {
        // offline: the server copy stays until unshared from another try
      }
    }
    for (const id of s.recordingIds || []) await localStorageService.deleteRecording(id);
    walkSessionService.deleteSession(s.sessionId);
    setList((l) => l.filter((x) => x.sessionId !== s.sessionId));
    setConfirm(null);
    onChanged?.();
  };

  return (
    <section className="perma-panel" aria-label={t('perma.list.title')}>
      <header>
        <b>{t('perma.list.title')}</b>
        <button type="button" className="afpp-x" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
      </header>
      {!list.length && <p className="afpp-dim">{t('perma.list.empty')}</p>}
      <ul>
        {list.map((s) => (
          <li key={s.sessionId}>
            <div className="perma-panel__title">
              <b>{s.title || t('perma.untitled')}</b>
              <span className="afpp-dim"> · {formatDate(s.startTime, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
            <div className="afpp-dim">
              {fmtTime(((s.endTime || s.startTime) - s.startTime) / 1000)} · {km(s.summary?.totalDistance)} ·{' '}
              {soundsLabel(s.recordingIds?.length || 0)}
            </div>
            <div className="perma-row">
              <button type="button" className="afpp-btn" onClick={() => onShow(s.sessionId)}>
                ⌖ {t('perma.list.show')}
              </button>
              <ShareControl sessionId={s.sessionId} />
              {confirm === s.sessionId ? (
                <>
                  <button type="button" className="afpp-btn" onClick={() => remove(s)}>
                    {t('perma.list.confirmDelete')}
                  </button>
                  <button type="button" className="afpp-btn" onClick={() => setConfirm(null)}>
                    {t('common.no')}
                  </button>
                </>
              ) : (
                <button type="button" className="afpp-btn" onClick={() => setConfirm(s.sessionId)} aria-label={t('common.delete')}>
                  ✕
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
