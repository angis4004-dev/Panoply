import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware replacements for next/link and next/navigation.
 *
 * Import Link from here, not from next/link, anywhere inside the trader
 * application. These wrappers carry the active locale into the href, so a
 * reader on /es/dashboard who follows a link to /settings lands on
 * /es/settings rather than being dropped back into English halfway through a
 * session.
 *
 * A plain <a href="/disclaimer"> does the same damage more quietly: it is a
 * full page load to the English page, and the only symptom is that the
 * language silently changed. That is what the no-html-link-for-pages lint rule
 * catches, and why the two it flagged were worth fixing rather than silencing.
 *
 * The admin console does not use these. It is English-only and lives on its
 * own host with no locale segment, so next/link is correct there.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
