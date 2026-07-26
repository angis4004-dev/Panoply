'use client';

import Link from 'next/link';
import { ArrowUpRight, Bot, Grid, RefreshCcw, TrendingUp, Vault } from 'lucide-react';
import MetricsBentoGrid from '@/app/dashboard/components/MetricsBentoGrid';
import PnLAreaChart from '@/app/dashboard/components/PnLAreaChart';
import { PageHeader } from '@/components/dashboard/page-header';

const activeBots = [
  {
    name: 'WBTC Grid',
    detail: 'Range $62k–$68k',
    pnl: '+$1,240.20',
    stat: '24.5% APY',
    status: 'Running',
    icon: Grid,
  },
  {
    name: 'ETH Monthly DCA',
    detail: 'Next buy in 3 days',
    pnl: '+$450.12',
    stat: '$5,000 invested',
    status: 'Active',
    icon: RefreshCcw,
  },
];

const topYields = [
  { name: 'Aave V3', pool: 'USDC Supply', apy: '5.24%', letter: 'A', color: '#2EBAC6' },
  { name: 'Curve', pool: '3Pool LP', apy: '8.12%', letter: 'C', color: '#FF6B35' },
  { name: 'Lyra', pool: 'ETH Market Maker', apy: '12.4%', letter: 'L', color: '#D9A94E' },
];

export default function DashboardPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Portfolio Overview"
        description="Your AI-managed DeFi command center — bots, vaults, and yield in one view."
      />

      {/* Dry-run strip */}
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-[#D9A94E]/20 bg-[#D9A94E]/5 px-4 py-2.5">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#D9A94E]" />
        <p className="text-xs font-medium text-[#D9A94E]">
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
              className="inline-flex items-center gap-2 rounded-lg bg-[#D9A94E] px-4 py-2 text-sm font-semibold text-[#1A1305] hover:bg-[#E8BA5E] transition-colors"
            >
              <Bot className="h-4 w-4" />
              Create Bot
            </Link>
            <Link
              href="/dashboard/builder"
              className="inline-flex items-center gap-2 rounded-lg border border-[#212A35] px-4 py-2 text-sm font-medium text-[#E7ECF2] hover:border-[#D9A94E]/40 hover:bg-[#17202e] transition-colors"
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
              className="text-xs font-medium text-[#D9A94E] hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {activeBots.map((bot) => {
              const Icon = bot.icon;
              return (
                <div
                  key={bot.name}
                  className="rounded-xl border border-[#212A35] border-l-[#D9A94E] border-l-[3px] bg-[#122131]/50 p-4 hover:bg-[#17202e]/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#D9A94E]/10">
                        <Icon className="h-4 w-4 text-[#D9A94E]" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{bot.name}</h3>
                        <p className="text-xs text-[#8B95A5]">{bot.detail}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[#D9A94E]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#D9A94E]">
                      {bot.status}
                    </span>
                  </div>
                  <div className="mt-4 flex justify-between text-sm">
                    <div>
                      <p className="text-[#8B95A5]">P&amp;L</p>
                      <p className="font-mono font-semibold text-[#4ADE80]">{bot.pnl}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#8B95A5]">
                        {bot.stat.includes('%') ? 'APY' : 'Invested'}
                      </p>
                      <p className="font-mono font-semibold text-white">{bot.stat}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top yields */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Top Yields</h2>
            <Link
              href="/dashboard/yield"
              className="text-xs font-medium text-[#D9A94E] hover:underline"
            >
              Explore all
            </Link>
          </div>
          <div className="space-y-3">
            {topYields.map((yield_) => (
              <div
                key={yield_.name}
                className="flex items-center justify-between rounded-xl border border-[#212A35] bg-[#122131]/50 p-4 hover:bg-[#17202e]/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: yield_.color }}
                  >
                    {yield_.letter}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{yield_.name}</h3>
                    <p className="text-xs text-[#8B95A5]">{yield_.pool}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-bold text-[#4ADE80]">{yield_.apy}</p>
                  <p className="text-[10px] uppercase tracking-wide text-[#8B95A5]">APY</p>
                </div>
              </div>
            ))}
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
                    stroke="#D9A94E"
                    strokeWidth="2.5"
                    strokeDasharray="78 100"
                    strokeLinecap="round"
                  />
                </svg>
                <Vault className="absolute h-5 w-5 text-[#D9A94E]" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
