import Link from 'next/link';
import { Reveal } from '@/components/ui/Reveal';
import { CountUpOnView } from '@/components/ui/RollingNumber';

/**
 * Alternating two-column feature rows (text + a small UI mockup card,
 * sides swapping each row) - the structural pattern requested from
 * chamberfi.com's homepage, adapted to Aegis's existing dark/cream
 * theme rather than their light palette (only layout/structure was
 * asked for, not a color or typography change).
 */

function SignalFlowMockup() {
  return (
    <div className="h-full rounded-2xl border border-ds-border bg-ds-surface-raised/60 p-6 transition-all duration-base ease-ds-out hover:border-primary/40 hover:shadow-[0_0_40px_rgba(255,240,201,0.12)]">
      <div className="rounded-lg bg-[#0D1219] border border-ds-border px-4 py-2.5 text-sm text-[#E7ECF2] mb-4 max-w-[85%] ml-auto">
        Open a grid signal flow on BTC/USDT
      </div>
      <div className="rounded-lg bg-[#0D1219] border border-primary/20 p-4">
        <p className="text-ds-caption uppercase tracking-[0.2em] text-primary mb-3">Executing</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Grid · BTC/USDT</p>
            <p className="text-xs text-ds-text-muted">Confidence: 87% · ETA ~4s</p>
          </div>
          <span className="text-sm font-mono text-ds-value-positive">
            <CountUpOnView value={2.1} format={(n) => `+${n.toFixed(1)}%`} />
          </span>
        </div>
      </div>
    </div>
  );
}

function VaultStatMockup() {
  return (
    <div className="h-full rounded-2xl border border-ds-border bg-ds-surface-raised/60 p-6 transition-all duration-base ease-ds-out hover:border-primary/40 hover:shadow-[0_0_40px_rgba(255,240,201,0.12)]">
      <div className="flex items-center gap-4 mb-4 text-xs text-ds-text-muted">
        <span>
          <CountUpOnView value={28.07} format={(n) => `$${n.toFixed(2)}M TVL`} />
        </span>
        <span className="text-ds-value-positive">
          <CountUpOnView value={38.42} format={(n) => `${n.toFixed(2)}% (3M)`} />
        </span>
      </div>
      <svg viewBox="0 0 200 60" className="w-full h-16 mb-4" preserveAspectRatio="none">
        <path
          d="M0 40 C 20 20, 40 50, 60 35 S 100 15, 120 30 S 160 45, 200 20"
          fill="none"
          stroke="#00D4AA"
          strokeWidth="2"
        />
      </svg>
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-bold">
          V
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Momentum Vault</p>
          <p className="text-xs text-ds-text-muted">Risk score 5/10</p>
        </div>
      </div>
    </div>
  );
}

function YieldMockup() {
  const rows = [
    { label: 'Ethereum', sub: 'ETH', on: true },
    { label: 'Arbitrum', sub: 'ARB', on: true },
    { label: 'Polygon', sub: 'MATIC', on: false },
  ];
  return (
    <div className="h-full rounded-2xl border border-ds-border bg-ds-surface-raised/60 p-6 transition-all duration-base ease-ds-out hover:border-primary/40 hover:shadow-[0_0_40px_rgba(255,240,201,0.12)]">
      <p className="text-ds-caption uppercase tracking-[0.2em] text-ds-text-muted mb-4">
        Chains enabled for yield routing
      </p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-lg bg-[#0D1219] border border-ds-border px-4 py-2.5"
          >
            <div>
              <p className="text-sm font-medium text-white">{row.label}</p>
              <p className="text-xs text-ds-text-muted">{row.sub}</p>
            </div>
            <span
              className={`inline-flex h-5 w-9 items-center rounded-full transition-colors duration-base ease-ds-out ${row.on ? 'bg-primary/70 justify-end' : 'bg-[#212A35] justify-start'} px-0.5`}
            >
              <span className="h-4 w-4 rounded-full bg-white" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportMockup() {
  return (
    <div className="h-full rounded-2xl border border-ds-border bg-ds-surface-raised/60 p-6 transition-all duration-base ease-ds-out hover:border-primary/40 hover:shadow-[0_0_40px_rgba(255,240,201,0.12)]">
      <div className="rounded-lg bg-[#0D1219] border border-ds-border p-4 mb-4">
        <p className="text-sm font-semibold text-white mb-1">Your Portfolio Report is ready</p>
        <p className="text-xs text-ds-text-muted">Risk-adjusted allocation across 4 signal flows</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-[#0D1219] border border-ds-border py-3">
          <p className="text-sm font-mono text-primary">Med</p>
          <p className="text-[10px] uppercase tracking-wide text-ds-text-muted">Risk</p>
        </div>
        <div className="rounded-lg bg-[#0D1219] border border-ds-border py-3">
          <p className="text-sm font-mono text-primary">
            <CountUpOnView value={18} format={(n) => `${Math.round(n)}%`} />
          </p>
          <p className="text-[10px] uppercase tracking-wide text-ds-text-muted">Est. APY</p>
        </div>
        <div className="rounded-lg bg-[#0D1219] border border-ds-border py-3">
          <p className="text-sm font-mono text-primary">
            <CountUpOnView value={6} format={(n) => `${Math.round(n)}`} />
          </p>
          <p className="text-[10px] uppercase tracking-wide text-ds-text-muted">Assets</p>
        </div>
      </div>
    </div>
  );
}

const rows = [
  {
    eyebrow: 'Automated execution',
    title: 'AI-Powered Signal Flows',
    desc: 'Grid, DCA, and arbitrage signal flows that adapt to market conditions with automated parameter tuning.',
    href: '/dashboard/bots',
    mockup: SignalFlowMockup,
  },
  {
    eyebrow: 'Institutional grade',
    title: 'Risk-Managed Vaults',
    desc: 'Transparent performance tracking and dynamic risk controls, with every position visible on-chain.',
    href: '/dashboard/vaults',
    mockup: VaultStatMockup,
  },
  {
    eyebrow: 'Cross-chain',
    title: 'Optimized Yield',
    desc: 'Compare yield opportunities across chains with data-driven allocation suggestions and auto-compounding.',
    href: '/dashboard/yield',
    mockup: YieldMockup,
  },
  {
    eyebrow: 'Personalized',
    title: 'Portfolio Builder',
    desc: 'Generate a personalized portfolio report with risk analysis, delivered straight to your inbox.',
    href: '/dashboard/builder',
    mockup: ReportMockup,
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="relative py-20 sm:py-24 overflow-hidden">
      <div className="ds-network-glow -z-10" aria-hidden />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Left-aligned and asymmetric, deliberately unlike the centred
            eyebrow-over-heading block every other section uses. When all five
            sections run the identical centred formula the page never gives the
            eye a change of shape, which is a large part of why it read as
            templated. The hairline carries the alignment across the full
            measure so the break looks intentional rather than stray. */}
        <div className="mb-16 sm:mb-20 grid gap-x-10 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <p className="text-ds-caption font-semibold uppercase tracking-[0.35em] text-primary mb-3">
              Automated strategies, or build your own
            </p>
            <h2 className="font-display font-normal text-[2rem] leading-[1.1] sm:text-[3rem] tracking-[-0.01em] text-white">
              Every position, non-custodial.
            </h2>
          </div>
          <p className="text-sm text-ds-text-muted sm:max-w-[16rem] sm:text-right">
            Four ways to put capital to work, each one visible on-chain.
          </p>
          <div className="h-px w-full bg-[#212A35] sm:col-span-2" aria-hidden />
        </div>

        <div className="space-y-20 sm:space-y-24 lg:space-y-28">
          {rows.map((row, i) => {
            const Mockup = row.mockup;
            const reversed = i % 2 === 1;
            return (
              <div
                key={row.title}
                className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center"
              >
                <Reveal className={reversed ? 'lg:order-2' : ''}>
                  <p className="text-ds-caption font-semibold uppercase tracking-[0.3em] text-primary mb-3">
                    {row.eyebrow}
                  </p>
                  <h3 className="font-display font-normal text-[1.75rem] sm:text-[2.25rem] leading-[1.1] tracking-[-0.01em] text-white mb-4">
                    {row.title}
                  </h3>
                  <p className="text-ds-text-muted leading-relaxed mb-6 max-w-md">{row.desc}</p>
                  <Link
                    href={row.href}
                    className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface rounded"
                  >
                    Learn more →
                  </Link>
                </Reveal>
                <Reveal delay={100} className={reversed ? 'lg:order-1' : ''}>
                  <Mockup />
                </Reveal>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
