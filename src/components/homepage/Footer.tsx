import Link from 'next/link';
import { LineChart } from 'lucide-react';
import { AegisMark } from '@/components/ui/AegisLogo';
import { describeEntity, PLATFORM_ENTITY, TECHNOLOGY_ENTITY } from '@/lib/legal-entities';

/**
 * Shared link styling.
 *
 * The 44px minimum box is a touch-target requirement (Apple HIG / WCAG 2.5.8)
 * and is kept in full on phones. It was previously applied at every breakpoint,
 * which is what made this footer feel oversized: with a 8px stack gap, four
 * text links occupied 208px of a 236px column on desktop, where the pointer is
 * a mouse and the constraint does not apply. From `sm` up the box collapses to
 * its natural line height plus a small pad, roughly halving each column without
 * touching the mobile experience.
 */
const linkClass =
  'inline-flex min-h-[44px] sm:min-h-0 sm:py-1 items-center rounded text-ds-text-muted hover:text-[#E7ECF2] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]';

const navClass = 'flex flex-col gap-2 sm:gap-1.5 text-sm';

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
      { href: '/prd', label: 'Product Docs' },
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

export function Footer() {
  return (
    <footer id="about" className="pt-12 pb-8 border-t border-[#212A35]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Brand column is given more room than the three link columns, which
            only ever hold short labels - previously all four were equal width,
            leaving the link columns padded with dead space on wide screens. */}
        <div className="grid grid-cols-1 gap-y-10 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-x-12">
          {/* Wordmark carries the brand column on its own, at roughly double
              its previous size. The descriptor paragraph that used to sit here
              repeated the hero almost verbatim; a reader who has scrolled the
              whole page does not need it restated at the bottom. */}
          <div className="space-y-5">
            <div className="flex items-center gap-2.5">
              <AegisMark size={30} />
              <span className="font-wordmark text-2xl font-extrabold uppercase tracking-[0.14em] text-white sm:text-3xl">
                AEGIS
              </span>
            </div>

            {/* Attribution, not decoration: every price and chart in the
                product is CoinGecko data (lib/coingecko.ts, /api/prices), and
                their terms ask for it to be credited. It is the one badge
                here that states a fact rather than a slogan. */}
            <a
              href="https://www.coingecko.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2.5 rounded-xl border border-[#212A35] bg-[#122131]/60 py-1.5 pl-1.5 pr-4 transition-colors duration-fast ease-ds-out hover:border-primary/40 hover:bg-[#17202e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0A0E13]">
                <LineChart className="h-4 w-4 text-primary" aria-hidden />
              </span>
              <span className="text-sm font-medium text-[#E7ECF2]">Market data by CoinGecko</span>
            </a>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              {/* Larger and lighter than the links beneath, rather than smaller
                  and bolder. The heading is a signpost, not a label: at 14px
                  semibold it competed with the link text it was meant to
                  introduce. */}
              <h3 className="mb-4 text-lg font-medium text-white">{col.heading}</h3>
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
            than the end of the block. */}
        {/* Corporate disclosure sits with the copyright line, which is where a
            reader looks for it. Kept to the two facts that identify each
            company - name, jurisdiction, register number - with the full
            registered addresses on the legal pages rather than repeated here. */}
        <div className="mt-10 pt-5 border-t border-[#212A35] space-y-2 text-xs text-[#8B95A5]">
          <p>
            Aegis is operated by {describeEntity(TECHNOLOGY_ENTITY)} and{' '}
            {describeEntity(PLATFORM_ENTITY)}. Client funds are held by the{' '}
            {PLATFORM_ENTITY.jurisdiction} entity. Full details in our{' '}
            <Link href="/terms" className="underline hover:text-[#C5CCD6]">
              Terms of Service
            </Link>
            .
          </p>
          <p>© {new Date().getFullYear()} Aegis. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
