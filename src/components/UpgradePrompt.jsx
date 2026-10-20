/**
 * Upgrade modal shown by the free tier when a full-version feature is hit:
 * the recording limit ('limit' variant) or ZIP export/import ('zip' variant).
 * Self-contained — callers manage their own visibility state.
 */
import React from 'react';
import { Lock, X } from 'lucide-react';
import { t } from '../i18n';
import { MAX_RECORDINGS, openPaidListing } from '../config/tier.js';

const UpgradePrompt = ({ variant = 'limit', onClose }) => {
  const title = variant === 'zip' ? t('tier.zipLockedTitle') : t('tier.limitTitle');
  const body = variant === 'zip'
    ? t('tier.zipLockedBody')
    : t('tier.limitBody', { max: MAX_RECORDINGS });

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgb(20 50 20 / 65%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100000
    }}>
      <div style={{
        backgroundColor: '#f0f1ec',
        borderRadius: '14px',
        padding: '22px',
        maxWidth: '340px',
        width: '90%',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          title={t('common.close')}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#6B7280',
            padding: '4px'
          }}
        >
          <X size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Lock size={20} color="#4e4e86" />
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#000000c9' }}>
            {title}
          </h3>
        </div>
        <p style={{ margin: '0 0 18px 0', fontSize: '14px', color: '#4B5563', lineHeight: 1.5 }}>
          {body}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={openPaidListing}
            style={{
              padding: '12px',
              minHeight: '48px',
              backgroundColor: '#9dc04cd4',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {t('tier.getFull')}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '10px',
              minHeight: '44px',
              backgroundColor: 'transparent',
              color: '#4B5563',
              border: '1px solid rgba(78,78,134,0.22)',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradePrompt;
