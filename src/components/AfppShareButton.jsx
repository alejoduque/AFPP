/**
 * Share / unshare one derive on the AFPP global map. Opt-in: the first time,
 * it explains what becomes public and asks before uploading anything.
 * Renders nothing in builds without VITE_AFPP_API.
 */
import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import afppShareService from '../services/afppShareService.js';
import { t } from '../i18n';

const AfppShareButton = ({ sessionId, compact = false, onChange }) => {
  const [shared, setShared] = useState(() => afppShareService.isShared(sessionId));
  const [stage, setStage] = useState('idle'); // idle | consent | busy | done | error | confirmUnshare
  const [progress, setProgress] = useState([0, 0]);
  const [message, setMessage] = useState('');

  if (!afppShareService.enabled) return null;

  const share = async () => {
    setStage('busy');
    try {
      const { failed } = await afppShareService.shareDerive(sessionId, (done, total) => setProgress([done, total]));
      setShared(true);
      setStage(failed.length ? 'error' : 'done');
      setMessage(failed.length ? t('afpp.share.partial', { n: failed.length }) : t('afpp.share.done'));
      onChange && onChange(true);
    } catch (e) {
      setStage('error');
      setMessage(t('afpp.share.failed', { error: e.message }));
    }
  };

  const unshare = async () => {
    setStage('busy');
    try {
      await afppShareService.unshareDerive(sessionId);
      setShared(false);
      setStage('done');
      setMessage(t('afpp.share.removed'));
      onChange && onChange(false);
    } catch (e) {
      setStage('error');
      setMessage(t('afpp.share.failed', { error: e.message }));
    }
  };

  const onClick = () => {
    if (stage === 'busy') return;
    if (shared) return setStage('confirmUnshare');
    if (!afppShareService.hasConsent()) return setStage('consent');
    share();
  };

  const btn = {
    background: shared ? '#9b4dff' : 'none',
    border: shared ? 'none' : '1px solid rgba(155,77,255,0.55)',
    borderRadius: '6px',
    padding: compact ? '6px' : '8px 12px',
    cursor: 'pointer',
    color: shared ? 'white' : '#6a3bb0',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
  };
  const small = { fontSize: '11px', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: compact ? 'flex-end' : 'stretch' }}>
      <button onClick={onClick} style={btn} title={shared ? t('afpp.share.unshare') : t('afpp.share.share')} disabled={stage === 'busy'}>
        <Globe size={14} />
        {!compact && (shared ? t('afpp.share.shared') : t('afpp.share.share'))}
        {stage === 'busy' && progress[1] > 0 && ` ${progress[0]}/${progress[1]}`}
      </button>

      {stage === 'consent' && (
        <div style={{ fontSize: '12px', color: '#333', background: '#f3edff', borderRadius: '8px', padding: '8px', maxWidth: '320px' }}>
          {t('afpp.share.consent')}
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
            <button style={{ ...small, background: 'none', border: '1px solid #ccc' }} onClick={() => setStage('idle')}>
              {t('common.cancel')}
            </button>
            <button
              style={{ ...small, background: '#9b4dff', color: 'white', border: 'none' }}
              onClick={() => {
                afppShareService.giveConsent();
                share();
              }}
            >
              {t('afpp.share.agree')}
            </button>
          </div>
        </div>
      )}

      {stage === 'confirmUnshare' && (
        <div style={{ fontSize: '12px', color: '#333', display: 'flex', gap: '6px', alignItems: 'center' }}>
          {t('afpp.share.confirmUnshare')}
          <button style={{ ...small, background: '#c24a6e', color: 'white', border: 'none' }} onClick={unshare}>
            {t('common.yes')}
          </button>
          <button style={{ ...small, background: 'none', border: '1px solid #ccc' }} onClick={() => setStage('idle')}>
            {t('common.no')}
          </button>
        </div>
      )}

      {(stage === 'done' || stage === 'error') && message && (
        <div style={{ fontSize: '11px', color: stage === 'error' ? '#c24a6e' : '#6a3bb0', maxWidth: '320px' }}>{message}</div>
      )}
    </div>
  );
};

export default AfppShareButton;
