'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowUpRight, Vault, Waypoints } from 'lucide-react';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import MetricsBentoGrid from '@/app/(site)/dashboard/components/MetricsBentoGrid';
import { PageHeader } from '@/components/dashboard/page-header';
import { MarketTicker } from '@/components/dashboard/market-ticker';
import { DepositModal } from '@/components/dashboard/deposit-modal';
import { IdentityScore } from '@/components/dashboard/identity-score';
import { TierBadge } from '@/components/dashboard/tier-badge';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';
import { compactUsd } from '@/lib/utils';

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

interface TopYield {
  id: string;
  protocol: string;
  chain: string;
  symbol: string;
  apy: number;
  tvlUsd: number;
  risk: 'Low' | 'Medium' | 'High';
}

interface IdentitySummary {
  xp: number;
  tier: string;
  identityScore: number;
  tierProgress: {
    lifetimeDeposited: number;
    nextTier: string | null;
    nextThreshold: number | null;
    kycRequired: boolean;
  };
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

export default function DashboardPage() {
  const {
    bots,
    botsLoading,
    botsError,
    fetchBots,
    walletBalance,
    walletBalanceLoading,
    walletBalanceError,
    fetchWalletBalance,
    addToast,
  } = useAppStore();
  const { user } = useAuth();
  const isVerified = user?.kycStatus === 'verified';
  const [topYields, setTopYields] = useState<TopYield[]>([]);
  const [yieldMeta, setYieldMeta] = useState<{ asOf: string; stale: boolean } | null>(null);
  const [yieldsLoading, setYieldsLoading] = useState(true);
  const [yieldsError, setYieldsError] = useState(false);
  const [yieldRetry, setYieldRetry] = useState(0);
  const [depositOpen, setDepositOpen] = useState(false);
  const [identity, setIdentity] = useState<IdentitySummary | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityError, setIdentityError] = useState(false);
  const [identityRetry, setIdentityRetry] = useState(0);

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

  useEffect(() => {
    setIdentityLoading(true);
    setIdentityError(false);
    fetch('/api/achievements')
      .then((res) => {
        if (!res.ok) throw new Error('Identity request failed');
        return res.json();
      })
      .then(setIdentity)
      .catch(() => {
        setIdentity(null);
        setIdentityError(true);
      })
      .finally(() => setIdentityLoading(false));
  }, [identityRetry]);

  const kycStatus = user?.kycStatus ?? 'unverified';
  const kycStatusLabel = {
    unverified: 'Not verified',
    pending: 'Under review',
    verified: 'Verified',
    rejected: 'Action required',
  }[kycStatus];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Portfolio Overview"
        description="Signal flows, vaults, and yield in one view."
      />

      {/* Live Spot Market Ticker */}
      <MarketTicker />

      {/* Setting a PIN and verifying identity used to be two separate banners
          that could appear together in no particular order. They are one
          ordered checklist now, which removes itself once both are done. */}
      <OnboardingChecklist />

      {/* Portfolio hero */}
      <section className="mb-6 rounded-xl border border-ds-border bg-ds-surface-raised/60 p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-ds-text-muted">
              Wallet Balance
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-4xl font-bold tabular-nums text-ds-text sm:text-5xl">
                {walletBalanceLoading
                  ? 'Loading'
                  : walletBalanceError
                    ? 'Unavailable'
                    : `$${walletBalance.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
              </span>
            </div>
            {walletBalanceError ? (
              <button
                type="button"
                onClick={fetchWalletBalance}
                className="mt-2 text-left text-sm font-semibold text-primary underline underline-offset-2"
              >
                Wallet unavailable. Retry
              </button>
            ) : (
              <p className="mt-2 text-sm text-ds-text-muted">
                {botsLoading
                  ? 'Loading signal flows'
                  : `${bots.length} signal flow${bots.length === 1 ? '' : 's'}`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (!isVerified) {
                  addToast('Complete identity verification before depositing funds.', 'info');
                  return;
                }
                setDepositOpen(true);
              }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-ds-border px-4 py-2 text-sm font-medium text-ds-text hover:border-primary/40 hover:bg-ds-surface-inset transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
            >
              Deposit
            </button>
            <Link
              href="/dashboard/bots"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
            >
              <Waypoints className="h-4 w-4" />
              Create Signal Flow
            </Link>
            <Link
              href="/dashboard/builder"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-ds-border px-4 py-2 text-sm font-medium text-ds-text hover:border-primary/40 hover:bg-ds-surface-inset transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
            >
              Run Builder
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        {/* The "complete identity verification" line that sat here is now a
            step in OnboardingChecklist above, so it is not asked for twice on
            one screen. Pressing Deposit while unverified still explains itself
            through a toast, which is the contextual half of the same message. */}
      </section>

      {depositOpen && <DepositModal onClose={() => setDepositOpen(false)} />}

      {/* Identity & tier widget */}
      <section className="mb-6 flex flex-col gap-4 rounded-xl border border-ds-border bg-ds-surface-raised/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-4">
          {identityLoading ? (
            <Skeleton className="h-14 w-40" />
          ) : (
            <IdentityScore score={identity?.identityScore ?? 0} size="sm" />
          )}
          <div>
            <div className="mb-1 flex items-center gap-2">
              <TierBadge tier={identity?.tier || user?.tier || 'unverified'} />
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  kycStatus === 'verified'
                    ? 'bg-ds-value-positive/10 text-ds-value-positive'
                    : kycStatus === 'rejected'
                      ? 'bg-ds-value-negative/10 text-ds-value-negative'
                      : 'bg-ds-value-warning/10 text-ds-value-warning'
                }`}
              >
                KYC: {kycStatusLabel}
              </span>
              {identity && (
                <span className="font-mono text-sm font-semibold text-ds-text">
                  {identity.xp} XP
                </span>
              )}
            </div>
            {identityError ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-ds-value-negative">Identity score unavailable.</p>
                <button
                  type="button"
                  onClick={() => setIdentityRetry((value) => value + 1)}
                  className="text-xs font-semibold text-primary underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : identity?.tierProgress.kycRequired ? (
              <p className="text-xs text-ds-text-muted">
                Complete KYC verification to unlock tier progress.
              </p>
            ) : identity?.tierProgress.nextTier && identity.tierProgress.nextThreshold != null ? (
              <p className="text-xs text-ds-text-muted">
                ${identity.tierProgress.lifetimeDeposited.toLocaleString()} of $
                {identity.tierProgress.nextThreshold.toLocaleString()} deposited toward{' '}
                {identity.tierProgress.nextTier}
              </p>
            ) : identity ? (
              <p className="text-xs text-ds-text-muted">Highest tier reached.</p>
            ) : null}
            {kycStatus === 'unverified' || kycStatus === 'rejected' ? (
              <Link
                href="/dashboard/kyc"
                className="mt-1 inline-flex min-h-[32px] items-center text-xs font-semibold text-primary underline underline-offset-2"
              >
                {kycStatus === 'rejected' ? 'Review verification' : 'Verify identity'}
              </Link>
            ) : null}
          </div>
        </div>
        <Link
          href="/dashboard/achievements"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded text-ds-label font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised"
        >
          View achievements
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </section>

      {/* Live metrics bento */}
      <MetricsBentoGrid botsError={botsError} onRetryBots={fetchBots} />

      {/* Chart */}
      <div className="mb-6">
        <PnLAreaChart />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active signal flows */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ds-text">Active Signal Flows</h2>
            <Link
              href="/dashboard/bots"
              className="inline-flex min-h-[44px] items-center rounded text-ds-label font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {botsLoading ? (
              [...Array(2)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-4"
                >
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </div>
              ))
            ) : botsError ? (
              <div className="rounded-xl border border-ds-value-negative/30 bg-ds-value-negative/5 p-4">
                <p className="text-sm text-ds-value-negative">Signal flows are unavailable.</p>
                <button
                  type="button"
                  onClick={fetchBots}
                  className="mt-2 text-sm font-semibold text-primary underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : bots.length === 0 ? (
              <p className="text-sm text-ds-text-muted">
                No signal flows deployed yet.{' '}
                <Link
                  href="/dashboard/bots"
                  className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
                >
                  Create one
                </Link>
                .
              </p>
            ) : (
              bots.slice(0, 3).map((bot) => (
                <div
                  key={bot.id}
                  className="rounded-xl border border-ds-border border-l-primary border-l-[3px] bg-ds-surface-raised/50 p-4 hover:bg-ds-surface-inset/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Waypoints className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-ds-text">{bot.pair}</h3>
                        <p className="text-xs text-ds-text-muted">{bot.type} strategy</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-ds-caption font-bold uppercase tracking-wide text-primary">
                      {bot.status}
                    </span>
                  </div>
                  <div className="mt-4 flex justify-between text-sm">
                    <div>
                      <p className="text-ds-text-muted">P&amp;L</p>
                      <p
                        className={`font-mono font-semibold ${bot.pnl.startsWith('+') ? 'text-ds-value-positive' : 'text-ds-value-negative'}`}
                      >
                        {bot.pnl}
                      </p>
                    </div>
                    <div>
                      <p className="text-ds-text-muted">Allocated</p>
                      <p className="font-mono font-semibold text-ds-text">
                        {bot.allocatedAmount != null
                          ? `$${bot.allocatedAmount.toLocaleString()}`
                          : '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-ds-text-muted">Confidence</p>
                      <p className="font-mono font-semibold text-ds-text">{bot.confidence}%</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

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
                    volatility and impermanent-loss exposure — not a rating of the protocol, and not
                    a recommendation.
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
    </div>
  );
}
