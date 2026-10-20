import { t } from '../i18n';

/** "1 sound" / "3 sounds" (es: "1 sonido" / "3 sonidos"). */
export const soundsLabel = (n) => (n === 1 ? t('afpp.sounds.one') : t('afpp.sounds', { n }));
