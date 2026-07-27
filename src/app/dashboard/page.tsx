'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Bot as BotIcon, TrendingUp, Vault } from 'lucide-react';
import MetricsBentoGrid from '@/app/dashboard/components/MetricsBentoGrid';
import PnLAreaChart from '@/app/dashboard/components/PnLAreaChart';
import { PageHeader } from '@/components/dashboard/page-header';
import { useAppStore } from '@/store/app-store';

interface TopYield {
  id: string;
  protocol: string;
  chain: string;
  apy: number;
}

const YIELD_COLORS = ['#2EBAC6', '#FF6B35', '#1E63FF'];

export default function DashboardPage() {
  const { bots, botsLoading } = useAppStore();
  const [topYields, setTopYields] = useState<TopYield[]>([]);
  const [yieldsLoading, setYieldsLoading] = useState(true);

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
        description="Your AI-managed DeFi command center — bots, vaults, and yield in one view."
      />

      {/* Dry-run strip */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-[#1E63FF]/20 bg-[#1E63FF]/5 px-4 py-2.5">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#1E63FF]" />
        <p className="text-xs font-medium text-[#1E63FF]">
          Dry-run mode — all trades simulated. No real funds at risk.
        </p>
      </div>

      {/* Portfolio hero */}
      <section className="mb-6 rounded-xl border border-[#212A35] bg-[#122131]/60 p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[#8B95A5]">
              Total Balance
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-4xl font-bold tabular-nums text-white sm:text-5xl">
                $84,230.15
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#4ADE80]/10 px-2.5 py-0.5 text-sm font-semibold text-[#4ADE80]">
                <TrendingUp className="h-3.5 w-3.5" />
                +4.2%
              </span>
            </div>
            <p className="mt-2 text-sm text-[#8B95A5]">+$3,412.40 this week · 3 bots active</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/bots"
              className="inline-flex items-center gap-2 rounded-lg bg-[#1E63FF] px-4 py-2 text-sm font-semibold text-[#F2F5FA] hover:bg-[#3D77FF] transition-colors"
            >
              <BotIcon className="h-4 w-4" />
              Create Bot
            </Link>
            <Link
              href="/dashboard/builder"
              className="inline-flex items-center gap-2 rounded-lg border border-[#212A35] px-4 py-2 text-sm font-medium text-[#E7ECF2] hover:border-[#1E63FF]/40 hover:bg-[#17202e] transition-colors"
            >
              Run Builder
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Live metrics bento */}
      <MetricsBentoGrid />

      {/* Chart */}
      <div className="mb-6">
        <PnLAreaChart />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active bots */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Active Bots</h2>
            <Link
              href="/dashboard/bots"
              className="text-xs font-medium text-[#1E63FF] hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {botsLoading ? (
              <p className="text-sm text-[#8B95A5]">Loading bots...</p>
            ) : bots.length === 0 ? (
              <p className="text-sm text-[#8B95A5]">
                No bots deployed yet.{' '}
                <Link href="/dashboard/bots" className="text-[#1E63FF] hover:underline">
                  Create one
                </Link>
                .
              </p>
            ) : (
              bots.slice(0, 3).map((bot) => (
                <div
                  key={bot.id}
                  className="rounded-xl border border-[#212A35] border-l-[#1E63FF] border-l-[3px] bg-[#122131]/50 p-4 hover:bg-[#17202e]/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1E63FF]/10">
                        <BotIcon className="h-4 w-4 text-[#1E63FF]" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{bot.pair}</h3>
                        <p className="text-xs text-[#8B95A5]">{bot.type} strategy</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[#1E63FF]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1E63FF]">
                      {bot.status}
                    </span>
                  </div>
                  <div className="mt-4 flex justify-between text-sm">
                    <div>
                      <p className="text-[#8B95A5]">P&amp;L</p>
                      <p
                        className={`font-mono font-semibold ${bot.pnl.startsWith('+') ? 'text-[#4ADE80]' : 'text-[#E5555A]'}`}
                      >
                        {bot.pnl}
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
              className="text-xs font-medium text-[#1E63FF] hover:underline"
            >
              Explore all
            </Link>
          </div>
          <div className="space-y-3">
            {yieldsLoading ? (
              <p className="text-sm text-[#8B95A5]">Loading yields...</p>
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
                    <p className="font-mono text-lg font-bold text-[#4ADE80]">{yield_.apy}%</p>
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
                <p className="mt-1 text-xl font-bold text-[#4ADE80]">Low Risk</p>
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
                <Vault className="absolute h-5 w-5 text-[#1E63FF]" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
