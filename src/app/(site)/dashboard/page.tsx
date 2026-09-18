'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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
import { CARD_TITLE, OverviewCard } from '@/components/dashboard/overview-card';

interface TopYield {
  id: string;
  protocol: string;
  chain: string;
  symbol: string;
  apy: number;
  tvlUsd: number;
  risk: 'Low' | 'Medium' | 'High';
}

// Recharts pulls in a meaningful amount of JS - load it only once this chart
// is actually needed rather than blocking the rest of the dashboard's paint.
const PnLAreaChart = dynamic(() => import('@/app/(site)/dashboard/components/PnLAreaChart'), {
  ssr: false,
  loading: () => (
    <div className="mb-4 h-[330px] rounded-2xl border border-ds-border bg-ds-surface-raised/60 p-5">
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

      {/* The chart, in its own card across the grid. */}
      <PnLAreaChart />

      {/* Top yields, the last card. */}
      <OverviewCard>
        <div className="flex items-center justify-between gap-3">
          <h2 className={CARD_TITLE}>Top yields</h2>
          <Link
            href="/dashboard/yield"
            className="inline-flex min-h-[44px] items-center rounded text-[13px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            Explore all yields
          </Link>
        </div>
        <div>
          {yieldsLoading ? (
            [...Array(3)].map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 border-t border-ds-border py-3.5"
              >
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-5 w-12" />
              </div>
            ))
          ) : yieldsError ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-ds-border pt-3 text-sm">
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
            <p className="border-t border-ds-border pt-3 text-sm text-ds-text-muted">
              No yield opportunities available yet.
            </p>
          ) : (
            topYields.map((yield_) => {
              // Bars compare each rate with the highest one shown, so the three
              // read against each other at a glance.
              const top = Math.max(...topYields.map((y) => y.apy), 0.0001);
              return (
                <div
                  key={yield_.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-t border-ds-border py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto_minmax(80px,0.7fr)_auto]"
                >
                  <div className="min-w-0 sm:contents">
                    <span className="block truncate text-sm text-ds-text">{yield_.protocol}</span>
                    <span className="block truncate text-[12.5px] text-ds-text-muted">
                      {yield_.chain} · {yield_.symbol} · {compactUsd(yield_.tvlUsd)} TVL
                    </span>
                  </div>
                  {/*
                    The risk band travels with the rate, always. It was in
                    the data all along and the old widget dropped it - so two
                    pools the source itself flagged High showed as bare green
                    percentages, directly above a hardcoded "Low Risk" badge.
                  */}
                  <RiskBadge
                    risk={yield_.risk}
                    className="hidden justify-self-start sm:inline-flex"
                  />
                  <span
                    aria-hidden
                    className="hidden h-1 overflow-hidden rounded-full bg-white/[0.06] sm:block"
                  >
                    <span
                      className="block h-full rounded-full bg-ds-value-positive opacity-80"
                      style={{ width: Math.max(4, (yield_.apy / top) * 100) + '%' }}
                    />
                  </span>
                  <span className="text-right font-mono text-base font-medium tabular-nums text-ds-value-positive">
                    {yield_.apy}%
                    <span className="block text-[11px] font-normal text-ds-text-muted sm:hidden">
                      {yield_.risk} risk
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/*
          Provenance, where a fabricated "Panoply Risk Score - Low Risk -
          78 / 100" used to sit. Every part of that card was a literal; it
          read nothing and computed nothing, and it sat beneath pools the data
          itself rated High. What replaces it answers the question the old
          card only pretended to: where these numbers came from and how old
          they are. Kept whole as a footnote rather than its own card.
        */}
        {!yieldsLoading && !yieldsError && topYields.length > 0 && (
          <p className="border-t border-ds-border pt-3 text-xs leading-relaxed text-ds-text-muted">
            Live pool rates from DefiLlama, filtered to pools over $1m with at least a month of
            history. Risk bands are derived from each pool&apos;s liquidity, rate volatility and
            impermanent-loss exposure, not a rating of the protocol, and not a recommendation. Bars
            compare each rate with the highest shown.
            {yieldMeta && (
              <>
                {' '}
                {yieldMeta.stale ? 'Last reached' : 'Updated'}{' '}
                {new Date(yieldMeta.asOf).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {yieldMeta.stale && ', refresh failed, showing the last good data'}.
              </>
            )}
          </p>
        )}
      </OverviewCard>
    </div>
  );
}
