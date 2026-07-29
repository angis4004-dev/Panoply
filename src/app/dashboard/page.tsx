'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowUpRight, Bot as BotIcon, Vault } from 'lucide-react';
import MetricsBentoGrid from '@/app/dashboard/components/MetricsBentoGrid';
import { PageHeader } from '@/components/dashboard/page-header';
import { DepositWalletModal } from '@/components/dashboard/deposit-wallet-modal';
import { IdentityScore } from '@/components/dashboard/identity-score';
import { TierBadge } from '@/components/dashboard/tier-badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';

// Recharts pulls in a meaningful amount of JS - load it only once this chart
// is actually needed rather than blocking the rest of the dashboard's paint.
const PnLAreaChart = dynamic(() => import('@/app/dashboard/components/PnLAreaChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-[#122131] border border-[#212A35] rounded-2xl p-5 h-[289px]">
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
  apy: number;
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
  // contrast for this palette.
  return luminance > 0.18 ? '#0A0E13' : '#F2F5FA';
}

export default function DashboardPage() {
  const { bots, botsLoading, walletBalance, addToast } = useAppStore();
  const { user } = useAuth();
  const isVerified = user?.kycStatus === 'verified';
  const [topYields, setTopYields] = useState<TopYield[]>([]);
  const [yieldsLoading, setYieldsLoading] = useState(true);
  const [depositOpen, setDepositOpen] = useState(false);
  const [identity, setIdentity] = useState<IdentitySummary | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);

  useEffect(() => {
    fetch('/api/yield')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TopYield[]) => setTopYields([...data].sort((a, b) => b.apy - a.apy).slice(0, 3)))
      .catch(() => setTopYields([]))
      .finally(() => setYieldsLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/achievements')
      .then((res) => (res.ok ? res.json() : null))
      .then(setIdentity)
      .catch(() => setIdentity(null))
      .finally(() => setIdentityLoading(false));
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Portfolio Overview"
        description="Your AI-managed DeFi command center — signal flows, vaults, and yield in one view."
      />

      {/* Dry-run strip */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
        <p className="text-xs font-medium text-primary">
          Dry-run mode — all trades simulated. No real funds at risk.
        </p>
      </div>

      {/* Portfolio hero */}
      <section className="mb-6 rounded-xl border border-[#212A35] bg-[#122131]/60 p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[#8B95A5]">
              Wallet Balance
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-4xl font-bold tabular-nums text-white sm:text-5xl">
                $
                {walletBalance.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <p className="mt-2 text-sm text-[#8B95A5]">
              {bots.length} signal flow{bots.length === 1 ? '' : 's'} active
            </p>
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
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#212A35] px-4 py-2 text-sm font-medium text-[#E7ECF2] hover:border-primary/40 hover:bg-[#17202e] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
            >
              Deposit
            </button>
            <Link
              href="/dashboard/bots"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
            >
              <BotIcon className="h-4 w-4" />
              Create Signal Flow
            </Link>
            <Link
              href="/dashboard/builder"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#212A35] px-4 py-2 text-sm font-medium text-[#E7ECF2] hover:border-primary/40 hover:bg-[#17202e] transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
            >
              Run Builder
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        {!isVerified && (
          <p className="mt-4 text-xs text-[#8B95A5]">
            <Link
              href="/dashboard/kyc"
              className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
            >
              Complete identity verification
            </Link>{' '}
            to deposit funds and allocate capital to signal flows.
          </p>
        )}
      </section>

      {depositOpen && <DepositWalletModal onClose={() => setDepositOpen(false)} />}

      {/* Identity & tier widget */}
      <section className="mb-6 flex flex-col gap-4 rounded-xl border border-[#212A35] bg-[#122131]/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-4">
          {identityLoading ? (
            <Skeleton className="h-14 w-40" />
          ) : (
            <IdentityScore score={identity?.identityScore ?? 0} size="sm" />
          )}
          <div>
            <div className="mb-1 flex items-center gap-2">
              <TierBadge tier={identity?.tier || user?.tier || 'unverified'} />
              {identity && (
                <span className="font-mono text-sm font-semibold text-white">{identity.xp} XP</span>
              )}
            </div>
            {identity?.tierProgress.kycRequired ? (
              <p className="text-xs text-[#8B95A5]">
                Complete KYC verification to unlock tier progress.
              </p>
            ) : identity?.tierProgress.nextTier && identity.tierProgress.nextThreshold != null ? (
              <p className="text-xs text-[#8B95A5]">
                ${identity.tierProgress.lifetimeDeposited.toLocaleString()} of $
                {identity.tierProgress.nextThreshold.toLocaleString()} deposited toward{' '}
                {identity.tierProgress.nextTier}
              </p>
            ) : identity ? (
              <p className="text-xs text-[#8B95A5]">Highest tier reached.</p>
            ) : null}
          </div>
        </div>
        <Link
          href="/dashboard/achievements"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded text-ds-label font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#122131]"
        >
          View achievements
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </section>

      {/* Live metrics bento */}
      <MetricsBentoGrid />

      {/* Chart */}
      <div className="mb-6">
        <PnLAreaChart />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active signal flows */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Active Signal Flows</h2>
            <Link
              href="/dashboard/bots"
              className="inline-flex min-h-[44px] items-center rounded text-ds-label font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {botsLoading ? (
              [...Array(2)].map((_, i) => (
                <div key={i} className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </div>
              ))
            ) : bots.length === 0 ? (
              <p className="text-sm text-[#8B95A5]">
                No signal flows deployed yet.{' '}
                <Link
                  href="/dashboard/bots"
                  className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
                >
                  Create one
                </Link>
                .
              </p>
            ) : (
              bots.slice(0, 3).map((bot) => (
                <div
                  key={bot.id}
                  className="rounded-xl border border-[#212A35] border-l-primary border-l-[3px] bg-[#122131]/50 p-4 hover:bg-[#17202e]/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <BotIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{bot.pair}</h3>
                        <p className="text-xs text-[#8B95A5]">{bot.type} strategy</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-ds-caption font-bold uppercase tracking-wide text-primary">
                      {bot.status}
                    </span>
                  </div>
                  <div className="mt-4 flex justify-between text-sm">
                    <div>
                      <p className="text-[#8B95A5]">P&amp;L</p>
                      <p
                        className={`font-mono font-semibold ${bot.pnl.startsWith('+') ? 'text-green-400' : 'text-[#E5555A]'}`}
                      >
                        {bot.pnl}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#8B95A5]">Allocated</p>
                      <p className="font-mono font-semibold text-white">
                        {bot.allocatedAmount != null
                          ? `$${bot.allocatedAmount.toLocaleString()}`
                          : '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#8B95A5]">Confidence</p>
                      <p className="font-mono font-semibold text-white">{bot.confidence}%</p>
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
            <h2 className="text-lg font-semibold text-white">Top Yields</h2>
            <Link
              href="/dashboard/yield"
              className="inline-flex min-h-[44px] items-center rounded text-ds-label font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
            >
              Explore all
            </Link>
          </div>
          <div className="space-y-3">
            {yieldsLoading ? (
              [...Array(2)].map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-[#212A35] bg-[#122131]/50 p-4"
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
            ) : topYields.length === 0 ? (
              <p className="text-sm text-[#8B95A5]">No yield opportunities available yet.</p>
            ) : (
              topYields.map((yield_, i) => (
                <div
                  key={yield_.id}
                  className="flex items-center justify-between rounded-xl border border-[#212A35] bg-[#122131]/50 p-4 hover:bg-[#17202e]/40 transition-colors"
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
                    <div>
                      <h3 className="font-semibold text-white">{yield_.protocol}</h3>
                      <p className="text-xs text-[#8B95A5]">{yield_.chain}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold text-green-400">{yield_.apy}%</p>
                    <p className="text-ds-caption uppercase tracking-wide text-ds-text-muted">
                      APY
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Risk score card — signature element */}
          <div className="mt-4 rounded-xl border border-[#212A35] bg-[#122131]/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[#8B95A5]">
                  Aegis Risk Score
                </p>
                <p className="mt-1 text-xl font-bold text-green-400">Low Risk</p>
                <p className="text-sm text-[#8B95A5]">78 / 100</p>
              </div>
              <div className="relative flex h-16 w-16 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#212A35" strokeWidth="2.5" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="#FFF0C9"
                    strokeWidth="2.5"
                    strokeDasharray="78 100"
                    strokeLinecap="round"
                  />
                </svg>
                <Vault className="absolute h-5 w-5 text-primary" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
