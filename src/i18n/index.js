/**
 * Lightweight string layer (EN default, DE, FR, ES): no external library.
 *
 * - t(key, vars): active-language lookup with {name} interpolation.
 *   Falls back to English, then to the key itself, so a missing entry
 *   can never crash the UI.
 * - Language resolution: persisted choice ('soundwalk_lang' in localStorage)
 *   wins; otherwise the device language (es* → Spanish, anything else → English).
 * - subscribe(cb): App root re-renders the tree when the language changes;
 *   class components simply call t() at render time.
 */
import en from './en.js';
import es from './es.js';
import de from './de.js';
import fr from './fr.js';

// English is the default; German, French and Spanish are offered.
export const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'de', label: 'DE', name: 'Deutsch' },
  { code: 'fr', label: 'FR', name: 'Français' },
  { code: 'es', label: 'ES', name: 'Español' },
];
const dicts = { en, de, fr, es };
const LANG_STORAGE_KEY = 'afpp_lang';
const LOCALES = { en: 'en-GB', de: 'de-CH', fr: 'fr-CH', es: 'es-CO' };

let currentLang = null;
const listeners = new Set();

/** The reader's chosen language if they picked one, otherwise English. */
export function getLanguage() {
  if (currentLang) return currentLang;
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (dicts[stored]) {
      currentLang = stored;
      return currentLang;
    }
  } catch (e) {
    // localStorage unavailable: default
  }
  currentLang = 'en';
  return currentLang;
}

export function setLanguage(lang) {
  if (!dicts[lang]) return;
  currentLang = lang;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch (e) {
    // non-fatal: choice just won't persist
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach((cb) => {
    try {
      cb(lang);
    } catch (e) {
      console.warn('i18n listener failed:', e);
    }
  });
}

export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function t(key, vars) {
  const lang = getLanguage();
  let str = dicts[lang][key];
  if (str === undefined) str = dicts.en[key];
  if (str === undefined) return key;
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (m, name) =>
      vars[name] !== undefined ? String(vars[name]) : m
    );
  }
  return str;
}

/**
 * Translate a stored enum token (e.g. tOption('meta.weather', 'sunny')).
 * Unlike t(), an unknown value renders as the raw value — never as a key —
 * so old or foreign metadata always displays something sensible.
 */
export function tOption(prefix, value) {
  if (value === undefined || value === null || value === '') return '';
  const key = `${prefix}.${value}`;
  const lang = getLanguage();
  const str = dicts[lang][key] !== undefined ? dicts[lang][key] : dicts.en[key];
  return str !== undefined ? str : String(value);
}

export function getLocale() {
  return LOCALES[getLanguage()];
}

export function formatDate(ts, opts) {
  return new Date(ts).toLocaleDateString(getLocale(), opts);
}

export function formatTime(ts, opts) {
  return new Date(ts).toLocaleTimeString(getLocale(), opts);
}

export function formatDateTime(ts, opts) {
  return new Date(ts).toLocaleString(getLocale(), opts);
}
