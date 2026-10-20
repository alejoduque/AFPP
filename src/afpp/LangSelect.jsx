/** EN · DE · FR · ES, as one small 1-bit select. English is the default. */
import React from 'react';
import { LANGUAGES, getLanguage, setLanguage } from '../i18n';

export default function LangSelect() {
  return (
    <select
      className="afpp-btn afpp-lang"
      value={getLanguage()}
      onChange={(e) => setLanguage(e.target.value)}
      aria-label="Language · Sprache · Langue · Idioma"
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code} title={l.name}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
