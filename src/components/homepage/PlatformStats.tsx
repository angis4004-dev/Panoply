import Link from 'next/link';
import { Reveal } from '@/components/ui/Reveal';
import { TVL_USD, USERS, STRATEGY_COUNT, AS_OF } from '@/lib/platform-stats';
import { AUDIT } from '@/lib/audit-report';

/**
 * Social proof band, sitting directly under the hero.
 *
 * Three figures only. A fourth "volume" stat was requested but deliberately
 * omitted - see the note in lib/platform-stats.ts.
 *
 * The `as of` line and the audit link are not decoration. A number with no
 * date and no independent reference is the weakest form of social proof there
 * is, and on a page soliciting deposits an undated figure invites exactly the
 * scepticism the band is meant to answer. Stating provenance costs one line of
 * small text and is what separates this from a vanity ticker.
 */

const stats = [
  {
    value: TVL_USD,
    // Compact rather than the full figure: $35.5M is read at a glance where
    // $35,500,000 has to be counted. The unit lives in the number, not the
    // label, so the label stays a clean noun phrase.
    format: (n: number) => `$${(n / 1_000_000).toFixed(1)}M`,
    label: 'Total Value Locked',
  },
  {
    value: USERS,
    format: (n: number) => Math.round(n).toLocaleString('en-US'),
    label: 'Users',
  },
  {
    value: STRATEGY_COUNT,
    format: (n: number) => String(Math.round(n)),
    label: 'Strategy Categories',
  },
];

export function PlatformStats() {
  return (
    <section aria-labelledby="platform-stats-heading" className="py-14 border-y border-[#212A35]">
      <h2 id="platform-stats-heading" className="sr-only">
        Platform statistics
      </h2>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          {/* Divider between columns rather than boxes: three bordered cards
              would compete with the feature cards further down, and this band
              should read as one continuous fact strip. */}
          <dl className="grid grid-cols-1 divide-y divide-[#212A35] sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
            {stats.map((stat) => (
              <div key={stat.label} className="px-2 py-6 text-center sm:py-2">
                {/* Rendered as plain text, NOT with CountUpOnView.
                    That component initialises its state to 0 and only counts
                    up once an IntersectionObserver fires, so the server-
                    rendered HTML literally reads "$0.0M Total Value Locked"
                    and "0 Users" - confirmed by curling the page, which
                    returned zero occurrences of "35.5M". Harmless for the
                    decorative figures in FeaturesGrid; here it is what a
                    crawler, a link preview, and any visitor whose JS is slow
                    or blocked would see. A trust band that reads zero is worse
                    than no trust band. The Reveal wrapper already supplies the
                    entrance motion. */}
                <dd className="font-mono text-3xl sm:text-4xl font-bold tabular-nums text-white">
                  {stat.format(stat.value)}
                </dd>
                <dt className="mt-2 text-ds-caption font-semibold uppercase tracking-[0.25em] text-ds-text-muted">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </Reveal>

        <p className="mt-8 text-center text-xs text-ds-text-muted">
          Figures as of {AS_OF}.{' '}
          <Link
            href="/security"
            className="rounded text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
          >
            Independently reviewed by {AUDIT.auditor}
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
