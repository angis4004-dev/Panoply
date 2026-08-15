import { defineRouting } from 'next-intl/routing';

/**
 * The languages the trader application speaks.
 *
 * The operations console is deliberately not in this list. It is used by
 * internal staff, not customers, so translating it would double the work and
 * drag Arabic right-to-left layout through a surface nobody outside the
 * company sees. src/proxy.ts skips locale handling entirely on the admin host.
 */
export const locales = ['en', 'es', 'fr', 'de', 'it', 'ar', 'ja', 'zh', 'ko'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

/** Written out for the language switcher, in the language itself. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ar: 'العربية',
  ja: '日本語',
  zh: '简体中文',
  ko: '한국어',
};

/*
 * 'zh' is Simplified Chinese.
 *
 * next-intl matches Accept-Language by primary subtag, so zh-CN, zh-TW and
 * zh-HK all resolve here - which means readers in Taiwan and Hong Kong are
 * served Simplified rather than the Traditional script they expect. That is a
 * deliberate first step, not an oversight: Simplified covers by far the larger
 * audience, and the alternative was leaving all of them on English. Adding
 * 'zh-TW' as its own locale is the fix when Traditional is worth the second
 * catalogue, and nothing here has to change to allow it.
 */

/**
 * Arabic is the only right-to-left language here. Hebrew would join it if it
 * is ever added - the layout work is the same either way, so the direction is
 * derived from this set rather than hardcoded against 'ar'.
 */
const RTL_LOCALES = new Set<Locale>(['ar']);

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export const routing = defineRouting({
  locales,
  defaultLocale,

  /*
   * English keeps its existing URLs.
   *
   * `as-needed` means /dashboard stays /dashboard and only the other
   * languages take a prefix: /es/dashboard, /ar/dashboard. Every link already
   * out there - bookmarks, the reset-password emails already sent, whatever a
   * search engine has indexed - keeps working, which 'always' would have
   * broken by moving them all to /en/.
   */
  localePrefix: 'as-needed',

  /*
   * Read Accept-Language on a first visit, then remember the choice.
   *
   * Detection only decides where "/" sends someone. Once they pick from the
   * switcher, next-intl writes a cookie and that wins - so a French speaker in
   * Berlin is not fighting their browser settings on every visit.
   */
  localeDetection: true,
});
