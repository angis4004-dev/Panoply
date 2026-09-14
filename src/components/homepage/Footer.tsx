import Link from 'next/link';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';
import { describeEntity, PLATFORM_ENTITY, TECHNOLOGY_ENTITY } from '@/lib/legal-entities';

/**
 * Shared link styling.
 *
 * Three things are load-bearing here.
 *
 * The 44px minimum box is a touch-target requirement (Apple HIG / WCAG 2.5.8)
 * and is kept in full on phones. From `sm` up it collapses to its natural line
 * height plus a small pad, because on desktop the pointer is a mouse and the
 * constraint does not apply - at every breakpoint it made the footer roughly
 * twice as tall as its content needed.
 *
 * Links carry `ds-text-secondary`, one step brighter than the headings above
 * them. In a footer the destinations are the content and the category names
 * are signposting, so the links have to be what the eye lands on.
 *
 * The hover is gated behind a real pointer. Tailwind's bare `hover:` also
 * fires on touch, where there is no un-hover event, so a tapped link keeps its
 * hover colour until something else steals focus - it reads as selected.
 */
const linkClass =
  'inline-flex min-h-[44px] items-center rounded text-ds-text-secondary ' +
  'transition-colors duration-fast ease-ds-out sm:min-h-0 sm:py-1 ' +
  '[@media(hover:hover)_and_(pointer:fine)]:hover:text-ds-text ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface';

/**
 * Column heading.
 *
 * Small, tracked and uppercase rather than large and white. A heading set
 * larger than the links beneath it inverts the hierarchy: the reader's eye
 * lands on "Product" and "Platform" - words nobody came here to read - instead
 * of the destinations. Shrinking it and spacing the letters keeps it legible
 * as a divider while letting it recede behind the links it introduces.
 */
const headingClass = 'mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-ds-text-muted';

const navClass = 'flex flex-col gap-1 text-sm sm:gap-0.5';

const columns = [
  {
    heading: 'Product',
    links: [
      // Root-relative, not bare "#features". These sections only exist on the
      // homepage, so a bare hash resolved to nothing on /about, /tiers,
      // /charts and /signal-flows - the link was silently dead on four of the
      // five public pages. Prefixing with "/" navigates home first.
      { href: '/#features', label: 'Features' },
      // Was /dashboard/bots, which bounces logged-out visitors to sign-in.
      // The navbar's identically-labelled link already points at the public
      // page; this now matches it.
      { href: '/signal-flows', label: 'Signal Flows' },
      { href: '/dashboard/vaults', label: 'Vaults' },
      { href: '/dashboard/builder', label: 'Portfolio Builder' },
    ],
  },
  {
    heading: 'Platform',
    links: [
      { href: '/about', label: 'About' },
      { href: '/security', label: 'Security' },
      { href: '/tiers', label: 'Tiers' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms of Service' },
      { href: '/disclaimer', label: 'Disclaimer' },
    ],
  },
];

/**
 * @param showEntityDisclosure - whether to print the corporate disclosure.
 *
 * True everywhere except the homepage, which is kept clear of it by request.
 * The disclosure still reaches a visitor through any of the other five public
 * pages, all of which render this footer.
 */
export function Footer({ showEntityDisclosure = true }: { showEntityDisclosure?: boolean } = {}) {
  return (
    /*
     * No `id="about"` on this element.
     *
     * It used to carry one, which nothing linked to and which quietly shadowed
     * the real /about page: any `#about` written anywhere on the site would
     * have scrolled the reader to the footer instead of opening the page they
     * asked for.
     */
    <footer className="border-t border-ds-border pt-14 pb-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* The brand column is given more room than the three link columns,
            which only ever hold short labels - previously all four were equal
            width, leaving the link columns padded with dead space on wide
            screens. */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:gap-x-10 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-x-12">
          {/* Wordmark alone, spanning the full width on phones so the three
              link columns can sit two-up beneath it rather than stacking into
              one long ribbon. The descriptor paragraph that used to sit here
              restated the hero almost verbatim to a reader who had already
              scrolled the whole page, and nothing has replaced it - an empty
              brand column reads as deliberate, a filled one has to earn it. */}
          <div className="col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
              aria-label="Panoply home"
            >
              <PanoplyMark size={30} className="text-brand-cream" />
              <span className="font-wordmark text-2xl font-normal tracking-normal text-brand-cream sm:text-3xl">
                Panoply
              </span>
            </Link>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              <h3 className={headingClass}>{col.heading}</h3>
              <nav className={navClass} aria-label={col.heading}>
                {col.links.map((link) => (
                  <Link key={link.label} href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>

        {/* Left-aligned rather than centred: everything above it is left-aligned
            on a 4-column grid, so a centred line read as a stray element rather
            than the end of the block.

            Corporate disclosure sits with the copyright line, which is where a
            reader looks for it. Kept to the two facts that identify each
            company - name, jurisdiction, register number - with the full
            registered addresses on the legal pages rather than repeated here.

            Held to a measure. At 12px this paragraph ran the entire 1280px of
            the container, which is roughly 180 characters a line - far past the
            point where the eye reliably finds the start of the next one. */}
        <div className="mt-12 flex flex-col gap-2 border-t border-ds-border pt-6 text-xs leading-relaxed text-ds-text-muted">
          {showEntityDisclosure && (
            <p className="max-w-3xl">
              Panoply is operated by {describeEntity(TECHNOLOGY_ENTITY)} and{' '}
              {describeEntity(PLATFORM_ENTITY)}. Client funds are held by the{' '}
              {PLATFORM_ENTITY.jurisdiction} entity. Full details in our{' '}
              <Link
                href="/terms"
                className="underline underline-offset-2 transition-colors duration-fast ease-ds-out [@media(hover:hover)_and_(pointer:fine)]:hover:text-ds-text"
              >
                Terms of Service
              </Link>
              .
            </p>
          )}
          <p>© {new Date().getFullYear()} Panoply. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
