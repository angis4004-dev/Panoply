import { Reveal } from '@/components/ui/Reveal';
import { TVL_USD, USERS, STRATEGY_COUNT } from '@/lib/platform-stats';

/**
 * Social proof band, sitting directly under the hero.
 *
 * Three figures only. A fourth "volume" stat was requested but deliberately
 * omitted - see the note in lib/platform-stats.ts.
 *
 * Figures only - no caption. The audit attribution and the "as of" date that
 * used to sit under the band were both removed; the audit now lives on /about,
 * where there is room to say what was reviewed. AS_OF is still exported from
 * lib/platform-stats.ts as the record of when these were measured.
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
      </div>
    </section>
  );
}
