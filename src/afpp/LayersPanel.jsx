/**
 * Layers: which shared sounds may feed the rings, by their metadata (layers.mjs),
 * and whether the Telegram group's files show on the street map. Checkboxes
 * only; the choice is kept in this browser.
 */
import React from 'react';
import Checks from './Checks.jsx';
import { SOUNDSCAPE, CONTENT, DAYPARTS, SINCE, UNTAGGED, emptySelection, activeCount } from './layers.mjs';
import { t } from '../i18n';

const KEY = 'afpp_layers';

export function loadLayers() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveLayers(sel) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sel));
  } catch {
    // private mode: the choice lasts this visit
  }
}

export default function LayersPanel({ value, onChange, onClose, matching }) {
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <div className="afpp-layers" role="dialog" aria-label={t('layers.title')}>
      <header>
        <b>◫ {t('layers.title')}</b>
        <span className="afpp-dim">{t('layers.matching', { n: matching })}</span>
        <button type="button" className="afpp-x" onClick={onClose} aria-label={t('common.close')}>
          ×
        </button>
      </header>
      <p className="afpp-dim">{t('layers.body')}</p>
      <Checks
        legend={t('layers.soundscape')}
        options={[...SOUNDSCAPE.map((v) => [v, t(`tag.${v}`)]), [UNTAGGED, t('tag.untagged')]]}
        value={value.soundscape}
        onChange={set('soundscape')}
      />
      <Checks legend={t('layers.content')} options={CONTENT.map((v) => [v, t(`tag.${v}`)])} value={value.content} onChange={set('content')} />
      <Checks legend={t('layers.hour')} options={DAYPARTS.map((v) => [v, t(`daypart.${v}`)])} value={value.daypart} onChange={set('daypart')} />
      <Checks legend={t('layers.date')} options={SINCE.map((v) => [v, t(`since.${v}`)])} value={value.since} onChange={set('since')} radio name="afpp-since" />
      <Checks
        legend={t('layers.map')}
        options={[['telegram', t('layers.telegram')]]}
        value={value.telegram ? ['telegram'] : []}
        onChange={(v) => onChange({ ...value, telegram: v.includes('telegram') })}
      />
      <div className="perma-row">
        <button type="button" className="afpp-btn" disabled={!activeCount(value)} onClick={() => onChange({ ...emptySelection(), telegram: value.telegram })}>
          {t('layers.clear')}
        </button>
      </div>
    </div>
  );
}
