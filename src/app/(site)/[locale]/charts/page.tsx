import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { ArrowRight, Lock } from 'lucide-react';
import { Navbar } from '@/components/homepage/navbar';
import { Footer } from '@/components/homepage/Footer';
import { PageBackground } from '@/components/backgrounds/PageBackground';
import { Reveal } from '@/components/ui/Reveal';
import { ProtocolOverviewTable } from '@/components/charts/ProtocolOverviewTable';

export const metadata: Metadata = {
  title: 'Charts | Panoply',
  description:
    'Live market charts across supported pairs, with signal flow overlays once you sign in.',
};

const marketPairs = [
  { pair: 'BTC/ETH', bars: [40, 55, 48, 62, 58, 70, 65, 78, 72, 85, 80, 92] },
  { pair: 'ETH/USDT', bars: [60, 58, 65, 55, 62, 70, 68, 75, 71, 78, 74, 80] },
  { pair: 'SOL/USDT', bars: [30, 45, 38, 52, 48, 40, 55, 62, 58, 65, 60, 70] },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-ds-caption font-semibold uppercase tracking-[0.35em] text-primary mb-3">
      {children}
    </p>
  );
}

function SignInBadge() {
  return (
    <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-ds-surface/80 px-2.5 py-1 backdrop-blur-sm">
      <Lock className="h-3 w-3 text-primary" />
      <span className="text-ds-caption font-semibold uppercase tracking-[0.2em] text-primary">
        Sign in to activate
      </span>
    </div>
  );
}

export default function ChartsPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative isolate min-h-screen text-[#E7ECF2] antialiased"
    >
      <PageBackground />
      <Navbar />

      <section className="relative pt-32 pb-16 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(30,99,255,0.10),transparent_60%)]"
        />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <SectionEyebrow>Market data</SectionEyebrow>
            <h1 className="font-display font-normal text-[2.75rem] sm:text-[4rem] leading-[1.05] tracking-[-0.015em] text-white mb-6">
              Charts
            </h1>
            <p className="text-ds-text-muted text-lg leading-relaxed max-w-2xl mx-auto">
              Real-time price action across supported pairs. Sign in to switch pairs, overlay your
              active signal flows, and track your own portfolio&apos;s P&amp;L against the market.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {marketPairs.map((market, i) => (
              <Reveal key={market.pair} delay={i * 100}>
                <div className="relative h-full rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5 transition duration-base ease-ds-out hover:-translate-y-1 hover:border-primary/30">
                  <SignInBadge />
                  <p className="text-xs font-mono uppercase tracking-wider text-ds-text-muted mb-1">
                    Market · {market.pair}
                  </p>
                  <div className="mt-4 flex items-end gap-1.5 h-[140px]">
                    {market.bars.map((h, barIndex) => (
                      <div
                        key={barIndex}
                        className="flex-1 rounded-t bg-gradient-to-t from-primary/60 to-primary/10"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                  <p className="mt-4 text-ds-caption uppercase tracking-wider text-ds-text-muted">
                    Switch pairs and view live data after signing in
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border bg-[#0D1219]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-xl">
            <SectionEyebrow>Network breakdown</SectionEyebrow>
            <h2 className="font-display font-normal text-[2rem] sm:text-[2.5rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
              Protocol Overview
            </h2>
            <p className="text-ds-text-muted leading-relaxed">
              Total value locked, vaults, and fees across every supported network.
            </p>
          </div>
          <Reveal>
            <ProtocolOverviewTable />
          </Reveal>
        </div>
      </section>

      <section className="py-24 border-t border-ds-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative rounded-2xl border border-ds-border bg-ds-surface-raised/60 backdrop-blur-sm px-8 py-14 text-center overflow-hidden">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,99,255,0.08),transparent_70%)]"
              />
              <div className="relative">
                <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
                  See your portfolio against the market.
                </h2>
                <p className="text-ds-text-muted mb-8 max-w-xl mx-auto leading-relaxed">
                  Sign in for live charts with your signal flows and vault performance overlaid.
                </p>
                <Link
                  href="/sign-up-login-screen"
                  className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-all active:scale-[0.97] hover:shadow-lg hover:shadow-primary/25"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  );
}
