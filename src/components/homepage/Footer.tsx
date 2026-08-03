import Link from 'next/link';
import { AegisMark } from '@/components/ui/AegisLogo';

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

const navClass = 'flex flex-col gap-2 sm:gap-0.5 text-sm';

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
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AegisMark size={22} />
              <span className="font-wordmark text-lg font-extrabold uppercase tracking-[0.12em] text-white">
                AEGIS
              </span>
            </div>
            <p className="text-sm text-[#8B95A5] leading-relaxed max-w-xs">
              Quantitative Intelligence for Decentralized Finance — signal-driven automation, vault
              investing, and transparent portfolio analytics.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.heading}>
              <h3 className="text-sm font-semibold text-white mb-3">{col.heading}</h3>
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
        <div className="mt-10 pt-5 border-t border-[#212A35] text-xs text-[#8B95A5]">
          © {new Date().getFullYear()} Aegis. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
