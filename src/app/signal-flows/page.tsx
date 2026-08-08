import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Bot, Lock } from 'lucide-react';
import { Navbar } from '@/components/homepage/navbar';
import { Footer } from '@/components/homepage/Footer';
import { PageBackground } from '@/components/backgrounds/PageBackground';
import { Reveal } from '@/components/ui/Reveal';

export const metadata: Metadata = {
  title: 'Signal Flows — Aegis',
  description:
    'Grid, DCA, and arbitrage signal flows that adapt to market conditions with automated parameter tuning - non-custodial and always visible.',
};

/**
 * Illustrative preview of the signal flow library for logged-out visitors.
 *
 * The mix is deliberate: three flows up, one down. Every card previously
 * showed a positive figure, which is both unrealistic for automated trading
 * and self-defeating - a library where nothing ever loses reads as marketing
 * rather than as data, and undercuts the risk-management framing used
 * everywhere else on the site.
 *
 * The losing flow is internally consistent rather than arbitrary: SOL Momentum
 * has the lowest success rate of the four and is the one shown paused, so the
 * three figures tell the same story instead of contradicting each other.
 *
 * `successRate` is a ratio and can never be negative; `pnl` is the field that
 * carries sign, which is why the negative case needed it to exist.
 */
const previewBots = [
  { name: 'WBTC Grid', strategy: 'Grid', successRate: '78%', pnl: '+12.4%', status: 'Running' },
  { name: 'ETH Monthly DCA', strategy: 'DCA', successRate: '84%', pnl: '+8.1%', status: 'Active' },
  {
    name: 'SOL Momentum',
    strategy: 'Momentum',
    successRate: '61%',
    pnl: '-3.2%',
    status: 'Paused',
  },
  {
    name: 'ARB Arbitrage',
    strategy: 'Arbitrage',
    successRate: '72%',
    pnl: '+5.6%',
    status: 'Running',
  },
];

/** Paused is not a healthy state, so it must not share the running dot. */
const STATUS_DOT: Record<string, string> = {
  Running: 'bg-ds-value-positive',
  Active: 'bg-ds-value-positive',
  Paused: 'bg-ds-value-warning',
};

const strategyTypes = [
  {
    name: 'Grid',
    desc: 'Places layered buy/sell orders across a price range, profiting from volatility without predicting direction.',
  },
  {
    name: 'DCA',
    desc: 'Automates dollar-cost averaging on a schedule, smoothing entry price over time.',
  },
  {
    name: 'Arbitrage',
    desc: 'Captures price discrepancies for the same asset across venues, closing the gap automatically.',
  },
  {
    name: 'Momentum',
    desc: 'Follows established price trends, scaling exposure up or down as trend strength changes.',
  },
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
    <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-[#0A0E13]/80 px-2.5 py-1 backdrop-blur-sm">
      <Lock className="h-3 w-3 text-primary" />
      <span className="text-ds-caption font-semibold uppercase tracking-[0.2em] text-primary">
        Sign in to activate
      </span>
    </div>
  );
}

export default function SignalFlowsPage() {
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
            <SectionEyebrow>Automated execution</SectionEyebrow>
            <h1 className="font-display font-normal text-[2.75rem] sm:text-[4rem] leading-[1.05] tracking-[-0.015em] text-white mb-6">
              Signal Flows
            </h1>
            <p className="text-[#8B95A5] text-lg leading-relaxed max-w-2xl mx-auto">
              Grid, DCA, arbitrage, and momentum signal flows that adapt to market conditions with
              automated parameter tuning - every position stays non-custodial and visible in your
              dashboard.
            </p>
          </Reveal>

          <Reveal delay={120}>
            {/* Background removed from the source render (alpha derived from
                luminance), so the coin sits on the page's radial glow instead
                of a black box. Width is capped in rem and the height is auto,
                so it scales down on small screens rather than forcing
                horizontal scroll; sizes tells next/image which resolution to
                actually fetch per breakpoint. */}
            <div className="mt-10 sm:mt-14 flex justify-center">
              <Image
                src="/images/coin-transparent.webp"
                alt=""
                aria-hidden
                width={720}
                height={658}
                sizes="(max-width: 639px) 60vw, (max-width: 1023px) 320px, 400px"
                priority
                className="h-auto w-[60vw] max-w-[15rem] sm:w-80 sm:max-w-none lg:w-[25rem] select-none"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="py-16 border-t border-[#212A35]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <SectionEyebrow>Strategy types</SectionEyebrow>
            <h2 className="font-display font-normal text-[2rem] sm:text-[2.5rem] leading-[1.1] tracking-[-0.01em] text-white">
              Four ways to run a signal flow
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {strategyTypes.map((s, i) => (
              <Reveal key={s.name} delay={i * 80}>
                <div className="h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-6 transition duration-base ease-ds-out hover:-translate-y-1 hover:border-primary/25">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2">{s.name}</h3>
                  <p className="text-xs text-[#8B95A5] leading-relaxed">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-[#212A35] bg-[#0D1219]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12 max-w-xl">
            <SectionEyebrow>Live preview</SectionEyebrow>
            <h2 className="font-display font-normal text-[2rem] sm:text-[2.5rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
              Browse the signal flow library
            </h2>
            <p className="text-[#8B95A5] leading-relaxed">
              Sign in to deploy a signal flow, customize its parameters, or track its P&amp;L
              against your own portfolio.
            </p>
            {/* These four cards are sample figures, not a track record. Adding
                a signed P&L to them makes them look like reported historical
                performance, which on a page that leads to a deposit flow is a
                claim rather than an illustration. One line of small text is
                the difference. */}
            <p className="mt-3 text-xs text-ds-text-muted">
              Sample figures shown for illustration. Past performance does not indicate future
              results.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {previewBots.map((bot, i) => (
              <Reveal key={bot.name} delay={i * 80} className="group">
                <div className="relative h-full rounded-xl border border-[#212A35] bg-[#122131]/50 p-5 select-none transition duration-base ease-ds-out hover:-translate-y-1 hover:border-primary/30">
                  <SignInBadge />
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 mb-4 transition-transform duration-base ease-ds-out group-hover:scale-110">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">{bot.name}</h3>
                  <p className="text-xs text-[#8B95A5] mb-4">{bot.strategy} strategy</p>
                  {/* Success rate is a ratio, not a gain, so it renders
                      neutral. Colouring it green alongside a red P&L would
                      have two figures on one card disagreeing about whether
                      the flow is doing well. */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#8B95A5]">Success rate</span>
                    <span className="font-mono font-semibold tabular-nums text-white">
                      {bot.successRate}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-[#8B95A5]">P&amp;L</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        bot.pnl.startsWith('-')
                          ? 'text-ds-value-negative'
                          : 'text-ds-value-positive'
                      }`}
                    >
                      {bot.pnl}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[bot.status] ?? 'bg-ds-text-muted'}`}
                    />
                    <span className="text-ds-caption uppercase tracking-wider text-[#8B95A5]">
                      {bot.status}
                    </span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 border-t border-[#212A35]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative rounded-2xl border border-[#212A35] bg-[#122131]/60 backdrop-blur-sm px-8 py-14 text-center overflow-hidden">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,99,255,0.08),transparent_70%)]"
              />
              <div className="relative">
                <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
                  Put a signal flow on autopilot.
                </h2>
                <p className="text-[#8B95A5] mb-8 max-w-xl mx-auto leading-relaxed">
                  Sign in to deploy your first signal flow with your own risk parameters.
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
