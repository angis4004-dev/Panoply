import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isLocale } from './routing';

/**
 * Loads the message catalogue for the request's locale.
 *
 * English is always loaded and the requested locale is merged over it, so a
 * key that has not been translated yet renders the English string instead of
 * the raw key. That is what makes it safe to ship a locale before every string
 * in it has been written: the page degrades to English in patches rather than
 * showing `dashboard.overview.title` to a customer.
 *
 * It is also how the legal pages stay honest. Terms, Privacy and Disclaimer
 * are deliberately absent from every non-English catalogue - machine-
 * translated contract text for a product that moves customer money is not
 * something to ship, so those pages fall through to English until a
 * translator who is accountable for the wording supplies them.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isLocale(requested) ? requested : defaultLocale;

  const english = (await import('../../messages/en.json')).default;
  const messages =
    locale === defaultLocale
      ? english
      : { ...english, ...(await import(`../../messages/${locale}.json`)).default };

  return { locale, messages };
});
