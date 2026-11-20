import type { Locale } from 'date-fns';
import { de, enUS, es, fr, it, ptBR, zhCN } from 'date-fns/locale';

export const SUPPORTED_LOCALES = [
  'en',
  'fr',
  'it',
  'es',
  'pt-BR',
  'de',
  'zh-CN',
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const getLocaleName = (locale: string) => {
  const localeMap: Record<string, string> = {
    en: 'English',
    fr: 'Français',
    it: 'Italiano',
    es: 'Español',
    'pt-BR': 'Português (Brasil)',
    de: 'Deutsch',
    'zh-CN': '简体中文',
  };
  return localeMap[locale] || locale;
};

export const getDateLocale = (locale: string) => {
  const localeMap: Record<string, string> = {
    en: 'en-US',
    fr: 'fr-FR',
    it: 'it-IT',
    es: 'es-ES',
    'pt-BR': 'pt-BR',
    de: 'de-DE',
  };
  return localeMap[locale] || locale;
};

export const getDateFnsLocale = (locale: string) => {
  const localeMap: Record<string, Locale> = {
    en: enUS,
    fr,
    it,
    es,
    'pt-BR': ptBR,
    de,
    'zh-CN': zhCN,
  };
  return localeMap[locale] || enUS;
};

const chineseDatePatterns: Record<string, string> = {
  'EEE d MMM': 'M月d日 EEE',
  'EEEE d MMM': 'M月d日 EEEE',
  'EEEE d MMMM': 'M月d日 EEEE',
  'd MMM': 'M月d日',
  'd MMM yyyy': 'yyyy年M月d日',
  'd MMMM yyyy': 'yyyy年M月d日',
  'MMM yy': 'yy年M月',
  'MMMM yyyy': 'yyyy年M月',
};

/** Adapts the calendar's day, month and year order to the selected locale. */
export function localizeDatePattern(pattern: string, locale: string) {
  if (locale === 'zh-CN') return chineseDatePatterns[pattern] ?? pattern;
  if (locale.startsWith('de')) {
    return pattern
      .replace(/\bd( [ML])/g, 'd.$1')
      .replace(/(\bE{3,4}) d\b/g, '$1, d');
  }
  return pattern;
}
