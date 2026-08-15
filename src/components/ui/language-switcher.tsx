'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { Globe, ChevronDown } from 'lucide-react';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { localeNames, locales, type Locale } from '@/i18n/routing';

/*
 * Note the absence of useSearchParams.
 *
 * Calling it here would opt every page rendering this component out of static
 * generation - which is all of them, since it sits in the footer - turning 269
 * prerendered pages into server-rendered ones. The query string is instead read
 * from window.location at the moment of the switch, which needs no hook and
 * costs nothing at render.
 */

/**
 * The way out of a language you did not choose.
 *
 * Without this the app has a one-way door: next-intl writes a NEXT_LOCALE
 * cookie the moment anyone lands on a prefixed URL, and that cookie outranks
 * the browser's own Accept-Language on every request afterwards. Follow a
 * shared /ja link once - or mistype a path - and every later visit to "/"
 * redirects back to Japanese, with nothing on the page offering a way back.
 *
 * A native <select> rather than a custom menu, deliberately. It is keyboard
 * operable and screen-reader labelled for free, it opens as the platform's own
 * picker on iOS and Android instead of a cramped list under a fixed navbar,
 * and it type-aheads - which matters at nine languages and would matter more
 * at twenty. A hand-built listbox would have to re-earn all of that, and the
 * usual attempts get the focus trap subtly wrong.
 *
 * Each language is named in its own language (localeNames), because someone
 * stuck in a script they cannot read cannot find "Japanese" in an English
 * list, but can find 日本語.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /*
   * usePathname from @/i18n/navigation returns the path with the locale
   * segment already stripped, so passing it straight back with a new locale
   * keeps the reader on the page they were looking at. Next's own usePathname
   * would return "/ja/charts" here and produce "/de/ja/charts".
   */
  function switchTo(next: Locale) {
    if (next === locale) return;
    /*
     * Carried across deliberately. Someone can reach /reset-password?token=...
     * from an inbox and switch language before finishing, and dropping the
     * query there would strip the token and dead-end the reset.
     */
    const query = Object.fromEntries(new URLSearchParams(window.location.search));
    startTransition(() => {
      router.replace({ pathname, query }, { locale: next });
    });
  }

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <Globe
        className="pointer-events-none absolute start-2.5 h-4 w-4 text-ds-text-muted"
        aria-hidden="true"
      />
      <select
        value={locale}
        onChange={(event) => switchTo(event.target.value as Locale)}
        disabled={pending}
        /* The visible globe is decorative, so the control needs its own name. */
        aria-label="Choose a language"
        className="min-h-[44px] w-full cursor-pointer appearance-none rounded-lg border border-ds-border bg-ds-surface ps-8 pe-8 text-sm text-ds-text transition-colors duration-fast ease-ds-out hover:border-ds-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface disabled:opacity-60"
      >
        {locales.map((code) => (
          /*
           * Option colours set explicitly. The dropdown list is drawn by the
           * operating system, not the page, so on Windows it inherits neither
           * the dark surface nor the light ink - leaving light text on a white
           * popup, which is unreadable.
           *
           * lang on each option so a screen reader pronounces 日本語 with
           * Japanese phonetics rather than spelling it out as English.
           */
          <option key={code} value={code} lang={code} className="bg-ds-surface text-ds-text">
            {localeNames[code]}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-2.5 h-4 w-4 text-ds-text-muted"
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Crawlable sibling of the control above.
 *
 * A <select> is invisible to a crawler and to anyone browsing without
 * JavaScript, so on its own it would leave the other eight languages
 * undiscoverable. These are real anchors to the same page in every locale.
 *
 * Rendered in the footer only - it is a directory, not a control, and it would
 * be noise in the navbar.
 *
 * DO NOT "fix" the English entry to point at the bare path.
 *
 * It renders as /en/charts rather than /charts, which looks wrong under
 * localePrefix: 'as-needed' and is the obvious thing to tidy up. It is load
 * bearing. Measured against the running app, for a reader carrying
 * NEXT_LOCALE=ja:
 *
 *     GET /charts      -> 307 /ja/charts                    (still trapped)
 *     GET /en/charts   -> 307 /charts + NEXT_LOCALE=en      (escaped)
 *
 * The bare path is matched by the cookie before it ever reaches English, so a
 * "tidied" link would silently strand the exact reader this component exists
 * to rescue. The explicit prefix is what overrides the cookie; the redirect to
 * the canonical unprefixed URL then happens server-side, in one hop.
 */
export function LanguageLinks() {
  const active = useLocale() as Locale;
  const pathname = usePathname();

  return (
    <nav aria-label="Choose a language" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {locales.map((code) => (
        <Link
          key={code}
          href={pathname}
          locale={code}
          lang={code}
          hrefLang={code}
          aria-current={code === active ? 'true' : undefined}
          className={`rounded transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface ${
            code === active
              ? 'text-ds-text'
              : 'text-ds-text-muted hover:text-[#E7ECF2] hover:underline'
          }`}
        >
          {localeNames[code]}
        </Link>
      ))}
    </nav>
  );
}
