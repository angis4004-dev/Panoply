'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowUpRight, Bot as BotIcon, Vault } from 'lucide-react';
import MetricsBentoGrid from '@/app/dashboard/components/MetricsBentoGrid';
import { PageHeader } from '@/components/dashboard/page-header';
import { DepositWalletModal } from '@/components/dashboard/deposit-wallet-modal';
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

const YIELD_COLORS = ['#2EBAC6', '#FF6B35', '#1E63FF'];

export default function DashboardPage() {
  const { bots, botsLoading, walletBalance, addToast } = useAppStore();
  const { user } = useAuth();
  const isVerified = user?.kycStatus === 'verified';
  const [topYields, setTopYields] = useState<TopYield[]>([]);
  const [yieldsLoading, setYieldsLoading] = useState(true);
  const [depositOpen, setDepositOpen] = useState(false);

  useEffect(() => {
    fetch('/api/yield')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TopYield[]) => setTopYields([...data].sort((a, b) => b.apy - a.apy).slice(0, 3)))
      .catch(() => setTopYields([]))
      .finally(() => setYieldsLoading(false));
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
              className="inline-flex items-center gap-2 rounded-lg border border-[#212A35] px-4 py-2 text-sm font-medium text-[#E7ECF2] hover:border-primary/40 hover:bg-[#17202e] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
            >
              Deposit
            </button>
            <Link
              href="/dashboard/bots"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-[#F2F5FA] hover:bg-[#3D77FF] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
            >
              <BotIcon className="h-4 w-4" />
              Create Signal Flow
            </Link>
            <Link
              href="/dashboard/builder"
              className="inline-flex items-center gap-2 rounded-lg border border-[#212A35] px-4 py-2 text-sm font-medium text-[#E7ECF2] hover:border-primary/40 hover:bg-[#17202e] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
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
              className="rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
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
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
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
              className="rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
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
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: YIELD_COLORS[i % YIELD_COLORS.length] }}
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
                    <p className="text-[10px] uppercase tracking-wide text-[#8B95A5]">APY</p>
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
                    stroke="#1E63FF"
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
