'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  OnboardingChecklist,
  OnboardingChecklistPlaceholder,
} from '@/components/dashboard/onboarding-checklist';
import MetricsBentoGrid from '@/app/(site)/dashboard/components/MetricsBentoGrid';
import { PageHeader } from '@/components/dashboard/page-header';
import { MarketTicker } from '@/components/dashboard/market-ticker';
import { DepositModal } from '@/components/dashboard/deposit-modal';
import { PortfolioHero } from '@/components/dashboard/portfolio-hero';
import { SummaryTiles } from '@/components/dashboard/summary-tiles';
import { DepositQueryOpener } from '@/components/dashboard/deposit-query-opener';
import { useDepositSummary } from '@/hooks/use-deposit-summary';
import { deriveJourney } from '@/lib/onboarding-journey';
import { IdentityTierCard } from '@/components/dashboard/identity-tier-card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';

/** Only the rate is read here now; /dashboard/yield renders the rest. */
interface TopYield {
  apy: number;
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
  const [bestYieldApy, setBestYieldApy] = useState<number | null>(null);
  const [yieldsLoading, setYieldsLoading] = useState(true);
  const [yieldRetry] = useState(0);
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
    fetch('/api/yield')
      .then((res) => {
        if (!res.ok) throw new Error('Yield request failed');
        return res.json();
      })
      .then((data: { pools: TopYield[] }) => {
        // The route sorts by rate, so the first pool is the best on offer.
        setBestYieldApy(data.pools[0]?.apy ?? null);
      })
      .catch(() => {
        setBestYieldApy(null);
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

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr] lg:items-start">
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

      {/* Three tiles where three full lists used to be. Each page they
          summarise is in the sidebar and one tap away. */}
      <SummaryTiles bestYieldApy={bestYieldApy} yieldsLoading={yieldsLoading} />
    </div>
  );
}
