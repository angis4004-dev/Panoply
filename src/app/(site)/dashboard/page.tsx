'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Vault } from 'lucide-react';
import {
  OnboardingChecklist,
  OnboardingChecklistPlaceholder,
} from '@/components/dashboard/onboarding-checklist';
import MetricsBentoGrid from '@/app/(site)/dashboard/components/MetricsBentoGrid';
import { PageHeader } from '@/components/dashboard/page-header';
import { MarketTicker } from '@/components/dashboard/market-ticker';
import { DepositModal } from '@/components/dashboard/deposit-modal';
import { PortfolioHero } from '@/components/dashboard/portfolio-hero';
import { DepositQueryOpener } from '@/components/dashboard/deposit-query-opener';
import { useDepositSummary } from '@/hooks/use-deposit-summary';
import { deriveJourney } from '@/lib/onboarding-journey';
import { IdentityTierCard } from '@/components/dashboard/identity-tier-card';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';
import { compactUsd } from '@/lib/utils';

interface TopYield {
  id: string;
  protocol: string;
  chain: string;
  symbol: string;
  apy: number;
  tvlUsd: number;
  risk: 'Low' | 'Medium' | 'High';
}

const YIELD_COLORS = ['#2EBAC6', '#FF6B35', '#243B8F'];

/**
 * Picks a readable ink for a coloured avatar chip.
 *
 * These three swatches span a wide luminance range, so a single hardcoded
 * white failed on two of them - white on #2EBAC6 measures 2.35:1, well
 * under the 4.5:1 needed at this size. Choosing per-swatch keeps every
 * combination legible without giving up the colour coding.
 */
function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // 0.18 is the crossover where dark ink starts beating light ink on
  // contrast for this palette. Both returns are the design system's own
  // values; applied through a style prop, which resolves custom properties.
  return luminance > 0.18 ? 'var(--ds-surface-base)' : 'var(--ds-text-primary)';
}

// Recharts pulls in a meaningful amount of JS - load it only once this chart
// is actually needed rather than blocking the rest of the dashboard's paint.
const PnLAreaChart = dynamic(() => import('@/app/(site)/dashboard/components/PnLAreaChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-ds-surface-raised border border-ds-border rounded-2xl p-5 h-[289px]">
      <Skeleton className="h-4 w-32 mb-2" />
      <Skeleton className="h-3 w-24 mb-6" />
      <Skeleton className="h-[190px] w-full" />
    </div>
  ),
});

export default function DashboardPage() {
  const { bots, botsLoading, botsError, fetchBots, walletBalance, walletBalanceLoading, addToast } =
    useAppStore();
  const { user } = useAuth();
  const isVerified = user?.kycStatus === 'verified';
  const [topYields, setTopYields] = useState<TopYield[]>([]);
  const [yieldMeta, setYieldMeta] = useState<{ asOf: string; stale: boolean } | null>(null);
  const [yieldsLoading, setYieldsLoading] = useState(true);
  const [yieldsError, setYieldsError] = useState(false);
  const [yieldRetry, setYieldRetry] = useState(0);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositRefresh, setDepositRefresh] = useState(0);
  const deposits = useDepositSummary(isVerified, depositRefresh);

  /*
   * One answer for the checklist and the hero's button styling.
   *
   * Held back until everything it reads has loaded: the store starts at a
   * $0 balance and no flows before its first fetch lands, and computing from
   * those defaults would flash "make your first deposit" at a funded trader.
   */
  const journeyReady = !!user && deposits.loaded && !botsLoading && !walletBalanceLoading;
  const journey =
    journeyReady && user
      ? deriveJourney({
          hasPin: user.hasPin === true,
          kycStatus: user.kycStatus ?? 'unverified',
          deposits: deposits.summary,
          walletBalance,
          botCount: bots.length,
        })
      : null;
  const depositState = journey?.find((step) => step.key === 'deposit')?.state;
  const promoteDeposit = depositState === 'todo' || depositState === 'retry';

  // The one way into the deposit window, shared by the hero, the checklist and
  // the sidebar link. Verification is checked here as well as by the API so an
  // unverified trader gets a sentence rather than a window that cannot load.
  const openDeposit = useCallback(() => {
    if (!isVerified) {
      addToast('Complete identity verification before depositing funds.', 'info');
      return;
    }
    setDepositOpen(true);
  }, [isVerified, addToast]);

  useEffect(() => {
    setYieldsLoading(true);
    setYieldsError(false);
    fetch('/api/yield')
      .then((res) => {
        if (!res.ok) throw new Error('Yield request failed');
        return res.json();
      })
      // The route returns pools already filtered and sorted by APY, so this
      // takes the first three rather than re-deciding what "top" means.
      .then((data: { pools: TopYield[]; asOf: string; stale: boolean }) => {
        setTopYields(data.pools.slice(0, 3));
        setYieldMeta({ asOf: data.asOf, stale: data.stale });
      })
      .catch(() => {
        setTopYields([]);
        setYieldsError(true);
      })
      .finally(() => setYieldsLoading(false));
  }, [yieldRetry]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Portfolio Overview"
        description="Signal flows, vaults, and yield in one view."
      />

      {/* Live Spot Market Ticker */}
      <MarketTicker />

      <Suspense fallback={null}>
        <DepositQueryOpener ready={!!user} onOpen={openDeposit} />
      </Suspense>

      {/* The ordered setup checklist, now running through the first deposit
          and the first signal flow. It removes itself once both are done. */}
      {journey ? (
        <OnboardingChecklist steps={journey} onDeposit={openDeposit} />
      ) : (
        <OnboardingChecklistPlaceholder />
      )}

      {/* The first row of the Overview's card grid: same four columns and gap
          as the metric cards below, so every edge lines up down the page. */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:mb-4 sm:gap-4 md:grid-cols-4">
        <PortfolioHero promoteDeposit={promoteDeposit} onDeposit={openDeposit} />
        <IdentityTierCard />
      </div>

      {depositOpen && (
        <DepositModal
          onClose={() => {
            setDepositOpen(false);
            // Refetch so a deposit submitted in the window shows as waiting.
            setDepositRefresh((n) => n + 1);
          }}
        />
      )}

      {/* Live metrics bento */}
      <MetricsBentoGrid botsError={botsError} onRetryBots={fetchBots} />

      {/* Chart */}
      <div className="mb-6">
        <PnLAreaChart />
      </div>

      {/* Top yields */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ds-text">Top Yields</h2>
          <Link
            href="/dashboard/yield"
            className="inline-flex min-h-[44px] items-center rounded text-ds-label font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
          >
            Explore all
          </Link>
        </div>
        <div className="space-y-3">
          {yieldsLoading ? (
            [...Array(2)].map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl border border-ds-border bg-ds-surface-raised/50 p-4"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                </div>
                <Skeleton className="h-5 w-10" />
              </div>
            ))
          ) : yieldsError ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <p className="text-ds-value-negative">Yield opportunities are unavailable.</p>
              <button
                type="button"
                onClick={() => setYieldRetry((value) => value + 1)}
                className="font-semibold text-primary underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          ) : topYields.length === 0 ? (
            <p className="text-sm text-ds-text-muted">No yield opportunities available yet.</p>
          ) : (
            topYields.map((yield_, i) => (
              <div
                key={yield_.id}
                className="flex items-center justify-between rounded-xl border border-ds-border bg-ds-surface-raised/50 p-4 hover:bg-ds-surface-inset/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                    style={{
                      backgroundColor: YIELD_COLORS[i % YIELD_COLORS.length],
                      color: inkFor(YIELD_COLORS[i % YIELD_COLORS.length]),
                    }}
                  >
                    {yield_.protocol.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ds-text">{yield_.protocol}</h3>
                    <p className="truncate text-xs text-ds-text-muted">
                      {yield_.chain} · {yield_.symbol} · {compactUsd(yield_.tvlUsd)} TVL
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/*
                    The risk band travels with the rate, always. It was in
                    the data all along and the old widget dropped it - so two
                    pools the source itself flagged High showed as bare green
                    percentages, directly above a hardcoded "Low Risk" badge.
                  */}
                  <RiskBadge risk={yield_.risk} />
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold text-ds-value-positive">
                      {yield_.apy}%
                    </p>
                    <p className="text-ds-caption uppercase tracking-wide text-ds-text-muted">
                      APY
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/*
          Provenance, where a fabricated "Panoply Risk Score — Low Risk —
          78 / 100" used to sit.

          Every part of that card was a literal, including the dial's
          `strokeDasharray="78 100"`. It read nothing and computed nothing,
          and it sat directly beneath pools the data itself rated High -
          so the screen said Panoply had assessed these and found them safe.
          Nothing had assessed anything.

          What replaces it answers the question the old card only pretended
          to: where these numbers came from and how old they are.
        */}
        {!yieldsLoading && !yieldsError && topYields.length > 0 && (
          <div className="mt-4 rounded-xl border border-ds-border bg-ds-surface-raised/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  Yield data
                </p>
                <p className="mt-1 text-sm text-ds-text-secondary">
                  Live pool rates from DefiLlama, filtered to pools over $1m with at least a month
                  of history. Risk bands are derived from each pool&apos;s liquidity, rate
                  volatility and impermanent-loss exposure — not a rating of the protocol, and not a
                  recommendation.
                </p>
                {yieldMeta && (
                  <p className="mt-1.5 text-ds-caption text-ds-text-muted">
                    {yieldMeta.stale ? 'Last reached' : 'Updated'}{' '}
                    {new Date(yieldMeta.asOf).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {yieldMeta.stale && ' · refresh failed, showing the last good data'}
                  </p>
                )}
              </div>
              <Vault className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
