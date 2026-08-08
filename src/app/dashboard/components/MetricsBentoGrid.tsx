'use client';

import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Cpu,
  DollarSign,
  Activity,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';

type DeltaDir = 'up' | 'down' | 'neutral' | 'warn';

function DeltaBadge({ delta, dir }: { delta: string; dir: DeltaDir }) {
  const styles = {
    up: 'text-ds-value-positive bg-ds-value-positive/10',
    down: 'text-ds-value-negative bg-ds-value-negative/10',
    neutral: 'text-zinc-400 bg-zinc-700/50',
    warn: 'text-ds-value-warning bg-ds-value-warning/10',
  };
  const icons = {
    up: <TrendingUp size={11} />,
    down: <TrendingDown size={11} />,
    neutral: null,
    warn: <AlertTriangle size={11} />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-ds-caption font-semibold px-2 py-0.5 rounded-full ${styles[dir]}`}
    >
      {icons[dir]}
      {delta}
    </span>
  );
}

function parsePnlPercent(pnl: string): number {
  const n = parseFloat(pnl.replace('%', ''));
  return Number.isFinite(n) ? n : 0;
}

export default function MetricsBentoGrid() {
  const { bots, botsLoading, walletBalance } = useAppStore();

  if (botsLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4 mb-6">
        {[...Array(7)].map((_, i) => (
          <div
            key={i}
            className={`bg-ds-surface-raised border border-zinc-800 rounded-2xl p-5 animate-pulse ${i === 0 ? 'col-span-2' : ''}`}
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-800 mb-3" />
            <div className="h-6 w-20 bg-zinc-800 rounded mb-2" />
            <div className="h-3 w-28 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // Every metric below is derived from the user's real signal flows (bots) -
  // there is no separate trade/signal log to draw on, so cards that
  // conceptually implied one (Win Rate, Last Signal, Trades 24h) are
  // reframed around what's actually trackable per flow: current P&L,
  // confidence, allocation, and status.
  const totalAllocated = bots.reduce((sum, b) => sum + (b.allocatedAmount || 0), 0);
  const totalPnlDollar = bots.reduce(
    (sum, b) => sum + (b.allocatedAmount || 0) * (parsePnlPercent(b.pnl) / 100),
    0
  );
  const portfolioPnlPercent = totalAllocated > 0 ? (totalPnlDollar / totalAllocated) * 100 : 0;
  const pnlDir: DeltaDir = totalPnlDollar > 0 ? 'up' : totalPnlDollar < 0 ? 'down' : 'neutral';

  const profitableCount = bots.filter((b) => parsePnlPercent(b.pnl) > 0).length;
  const profitableRate = bots.length > 0 ? (profitableCount / bots.length) * 100 : 0;

  const avgConfidence =
    bots.length > 0 ? bots.reduce((sum, b) => sum + b.confidence, 0) / bots.length : 0;

  const topBot = bots.reduce<(typeof bots)[number] | null>(
    (top, b) => (!top || (b.allocatedAmount || 0) > (top.allocatedAmount || 0) ? b : top),
    null
  );
  const topBotValue = topBot
    ? (topBot.allocatedAmount || 0) * (1 + parsePnlPercent(topBot.pnl) / 100)
    : 0;

  const runningCount = bots.filter((b) => b.status === 'running').length;
  const pausedCount = bots.filter((b) => b.status === 'paused').length;

  const worstBot = bots.reduce<(typeof bots)[number] | null>(
    (worst, b) => (!worst || parsePnlPercent(b.pnl) < parsePnlPercent(worst.pnl) ? b : worst),
    null
  );
  const drawdownAbs = worstBot ? Math.max(0, -parsePnlPercent(worstBot.pnl)) : 0;
  const drawdownDir: DeltaDir = drawdownAbs >= 5 ? 'warn' : drawdownAbs > 0 ? 'down' : 'neutral';

  const deployedShare =
    totalAllocated + walletBalance > 0
      ? (totalAllocated / (totalAllocated + walletBalance)) * 100
      : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4 mb-6">
      {/* HERO: Realized P&L — spans 2 cols */}
      <div className="col-span-2 bg-gradient-to-br from-[#122131] to-[#122131]/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group hover:border-primary/30 transition-colors duration-base ease-ds-out">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <DollarSign size={16} className="text-primary" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-ds-text-secondary">
                Realized P&L
              </span>
            </div>
            <DeltaBadge delta={`${Math.abs(portfolioPnlPercent).toFixed(1)}%`} dir={pnlDir} />
          </div>
          <p className="text-4xl font-bold text-primary font-mono tabular-nums">
            {totalPnlDollar >= 0 ? '+' : ''}$
            {totalPnlDollar.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-xs text-ds-text-secondary">
            {bots.length} signal flow{bots.length === 1 ? '' : 's'} · $
            {totalAllocated.toLocaleString()} deployed · Dry-run
          </p>
        </div>
      </div>

      {/* Profitable Flows (was a simulated Win Rate) */}
      <div className="bg-ds-surface-raised border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors duration-base ease-ds-out group">
        <div className="flex items-center justify-between mb-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Target
              size={16}
              className="text-zinc-400 group-hover:text-primary transition-colors"
            />
          </div>
          <DeltaBadge
            delta={`${profitableCount}/${bots.length}`}
            dir={bots.length === 0 ? 'neutral' : profitableRate >= 50 ? 'up' : 'down'}
          />
        </div>
        <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">
          {profitableRate.toFixed(0)}%
        </p>
        <p className="text-ds-caption font-semibold uppercase tracking-widest text-ds-text-secondary mt-1">
          Profitable Flows
        </p>
        <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full"
            style={{ width: `${profitableRate}%` }}
          />
        </div>
      </div>

      {/* Avg Confidence */}
      <div className="bg-ds-surface-raised border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors duration-base ease-ds-out group">
        <div className="flex items-center justify-between mb-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Cpu size={16} className="text-zinc-400 group-hover:text-primary transition-colors" />
          </div>
        </div>
        <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">
          {avgConfidence.toFixed(0)}%
        </p>
        <p className="text-ds-caption font-semibold uppercase tracking-widest text-ds-text-secondary mt-1">
          Avg Confidence
        </p>
        <div className="mt-3 flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary/40 to-primary rounded-full"
              style={{ width: `${avgConfidence}%` }}
            />
          </div>
        </div>
      </div>

      {/* Active Position — largest-allocation signal flow */}
      <div className="bg-ds-surface-raised border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors duration-base ease-ds-out">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Activity size={16} className="text-zinc-400" />
          </div>
          <span className="text-ds-caption font-bold uppercase tracking-widest text-ds-text-secondary">
            Active Position
          </span>
        </div>
        <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">
          $
          {topBotValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">
            {topBot?.pair || 'No flows yet'}
          </span>
          {topBot && <span className="text-xs text-primary font-mono">LONG</span>}
        </div>
        <p className="text-ds-caption text-ds-text-secondary mt-2">
          {topBot
            ? `Allocated: $${(topBot.allocatedAmount || 0).toLocaleString()} · Confidence: ${topBot.confidence}%`
            : 'Deploy a signal flow to see it here'}
        </p>
      </div>

      {/* Signal Flows (was a simulated Last Signal) */}
      <div className="bg-ds-surface-raised border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors duration-base ease-ds-out">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Zap size={16} className="text-zinc-400" />
            </div>
            <span className="text-ds-caption font-bold uppercase tracking-widest text-ds-text-secondary">
              Signal Flows
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`text-2xl font-bold px-3 py-1 rounded-lg font-mono ${runningCount > 0 ? 'badge-buy' : 'bg-zinc-800 text-zinc-400'}`}
          >
            {runningCount} RUNNING
          </span>
        </div>
        <p className="text-ds-caption text-ds-text-secondary mt-1.5">
          {pausedCount} paused · {bots.length} total
        </p>
      </div>

      {/* Capital Deployed (was a simulated Trades 24h) */}
      <div className="bg-ds-surface-raised border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors duration-base ease-ds-out">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            <TrendingUp size={16} className="text-zinc-400" />
          </div>
          <span className="text-ds-caption font-bold uppercase tracking-widest text-ds-text-secondary">
            Capital Deployed
          </span>
        </div>
        <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">
          ${totalAllocated.toLocaleString()}
        </p>
        <p className="text-ds-caption text-ds-text-secondary mt-2">
          {deployedShare.toFixed(0)}% of total capital
        </p>
      </div>

      {/* Drawdown — worst-performing open flow */}
      <div className="bg-gradient-to-br from-amber-500/5 to-[#122131] border border-amber-500/30 rounded-2xl p-5 hover:border-amber-500/50 transition-colors duration-base ease-ds-out">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <AlertTriangle size={16} className="text-amber-400" />
            </div>
            <span className="text-ds-caption bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">
              Drawdown
            </span>
          </div>
          <span className="text-ds-caption text-amber-400 font-semibold whitespace-nowrap">
            {drawdownDir === 'warn' ? 'NEAR LIMIT' : 'NORMAL'}
          </span>
        </div>
        <p className="text-2xl font-bold text-amber-400 font-mono tabular-nums">
          {drawdownAbs.toFixed(1)}%
        </p>
        <p className="text-ds-caption text-amber-400/90 mt-1">
          {worstBot ? `Worst flow: ${worstBot.pair}` : 'No flows yet'} · Alert fires at 5%
        </p>
        <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full"
            style={{ width: `${Math.min(100, (drawdownAbs / 5) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
