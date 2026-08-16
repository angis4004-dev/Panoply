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
    neutral: 'text-ds-text-secondary bg-ds-border-strong/50',
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

export default function MetricsBentoGrid({
  botsError = false,
  onRetryBots,
}: {
  botsError?: boolean;
  onRetryBots?: () => Promise<void>;
}) {
  const { bots, botsLoading, walletBalance } = useAppStore();

  if (botsError) {
    return (
      <div className="mb-6 rounded-xl border border-ds-value-negative/30 bg-ds-value-negative/5 p-5">
        <p className="text-sm font-semibold text-ds-value-negative">
          Portfolio metrics are unavailable.
        </p>
        <p className="mt-1 text-xs text-ds-text-muted">We could not load your signal flows.</p>
        {onRetryBots && (
          <button
            type="button"
            onClick={onRetryBots}
            className="mt-3 text-sm font-semibold text-primary underline underline-offset-2"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (botsLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4 mb-6">
        {[...Array(7)].map((_, i) => (
          <div
            key={i}
            className={`bg-ds-surface-raised border border-ds-border rounded-2xl p-5 animate-pulse ${i === 0 ? 'col-span-2' : ''}`}
          >
            <div className="w-8 h-8 rounded-lg bg-ds-border mb-3" />
            <div className="h-6 w-20 bg-ds-border rounded mb-2" />
            <div className="h-3 w-28 bg-ds-border rounded" />
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
  // Sums the unrounded modelled dollar figure, not the rounded percent
  // string, so this total agrees with the portfolio history chart exactly.
  // realizedPnlDollar is only absent if an older API response shape slips
  // through, in which case the percent-derived value is a safe fallback.
  const totalPnlDollar = bots.reduce(
    (sum, b) =>
      sum + (b.realizedPnlDollar ?? (b.allocatedAmount || 0) * (parsePnlPercent(b.pnl) / 100)),
    0
  );
  const portfolioPnlPercent = totalAllocated > 0 ? (totalPnlDollar / totalAllocated) * 100 : 0;
  const pnlDir: DeltaDir = totalPnlDollar > 0 ? 'up' : totalPnlDollar < 0 ? 'down' : 'neutral';

  const profitableCount = bots.filter(
    (b) => (b.realizedPnlDollar ?? parsePnlPercent(b.pnl)) > 0
  ).length;
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
  /*
   * Whether the largest flow actually holds anything right now.
   *
   * Allocating capital to a flow does not open a position - the flow has to
   * decide to buy, and the order has to fill. This card presented the two as
   * the same thing, so a flow that had never traded still reported an "active
   * position" with a LONG direction it had never taken.
   */
  const topBotHasPosition = (topBot?.marketValue ?? 0) > 0;

  const runningCount = bots.filter((b) => b.status === 'running').length;
  const pausedCount = bots.filter((b) => b.status === 'paused').length;

  const worstBot = bots.reduce<(typeof bots)[number] | null>(
    (worst, b) => (!worst || parsePnlPercent(b.pnl) < parsePnlPercent(worst.pnl) ? b : worst),
    null
  );
  const drawdownAbs = worstBot ? Math.max(0, -parsePnlPercent(worstBot.pnl)) : 0;
  const drawdownDir: DeltaDir = drawdownAbs >= 5 ? 'warn' : drawdownAbs > 0 ? 'down' : 'neutral';
  // Single source for the drawdown card's tone, so the border, icon, figure
  // and bar cannot drift apart from the status word.
  const alarmed = drawdownDir === 'warn';

  const deployedShare =
    totalAllocated + walletBalance > 0
      ? (totalAllocated / (totalAllocated + walletBalance)) * 100
      : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4 mb-6">
      {/* HERO: Realized P&L — spans 2 cols */}
      <div className="col-span-2 bg-gradient-to-br from-ds-surface-raised to-ds-surface-raised/80 border border-ds-border rounded-2xl p-5 relative overflow-hidden group hover:border-primary/30 transition-colors duration-base ease-ds-out">
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
            {totalAllocated.toLocaleString()} deployed
          </p>
        </div>
      </div>

      {/* Profitable Flows (was a simulated Win Rate) */}
      <div className="bg-ds-surface-raised border border-ds-border rounded-2xl p-5 hover:border-ds-border-strong transition-colors duration-base ease-ds-out group">
        <div className="flex items-center justify-between mb-3">
          <div className="w-8 h-8 rounded-lg bg-ds-border flex items-center justify-center">
            <Target
              size={16}
              className="text-ds-text-secondary group-hover:text-primary transition-colors"
            />
          </div>
          <DeltaBadge
            delta={`${profitableCount}/${bots.length}`}
            dir={bots.length === 0 ? 'neutral' : profitableRate >= 50 ? 'up' : 'down'}
          />
        </div>
        <p className="text-2xl font-bold text-ds-text font-mono tabular-nums">
          {profitableRate.toFixed(0)}%
        </p>
        <p className="text-ds-caption font-semibold uppercase tracking-widest text-ds-text-secondary mt-1">
          Profitable Flows
        </p>
        <div className="mt-3 h-1.5 bg-ds-border rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full"
            style={{ width: `${profitableRate}%` }}
          />
        </div>
      </div>

      {/* Avg Confidence */}
      <div className="bg-ds-surface-raised border border-ds-border rounded-2xl p-5 hover:border-ds-border-strong transition-colors duration-base ease-ds-out group">
        <div className="flex items-center justify-between mb-3">
          <div className="w-8 h-8 rounded-lg bg-ds-border flex items-center justify-center">
            <Cpu
              size={16}
              className="text-ds-text-secondary group-hover:text-primary transition-colors"
            />
          </div>
        </div>
        <p className="text-2xl font-bold text-ds-text font-mono tabular-nums">
          {avgConfidence.toFixed(0)}%
        </p>
        <p className="text-ds-caption font-semibold uppercase tracking-widest text-ds-text-secondary mt-1">
          Avg Confidence
        </p>
        <div className="mt-3 flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-ds-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary/40 to-primary rounded-full"
              style={{ width: `${avgConfidence}%` }}
            />
          </div>
        </div>
      </div>

      {/* Active Position — largest-allocation signal flow */}
      <div className="bg-ds-surface-raised border border-ds-border rounded-2xl p-5 hover:border-ds-border-strong transition-colors duration-base ease-ds-out">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-ds-border flex items-center justify-center">
            <Activity size={16} className="text-ds-text-secondary" />
          </div>
          <span className="text-ds-caption font-bold uppercase tracking-widest text-ds-text-secondary">
            {topBotHasPosition ? 'Active Position' : 'Largest Allocation'}
          </span>
        </div>
        <p className="text-2xl font-bold text-ds-text font-mono tabular-nums">
          $
          {(topBotHasPosition ? topBotValue : (topBot?.allocatedAmount ?? 0)).toLocaleString(
            undefined,
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          )}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-xs bg-ds-border text-ds-text-secondary px-2 py-0.5 rounded font-mono">
            {topBot?.pair || 'No flows yet'}
          </span>
          {/* Only claimed when something is actually held. Spot trading has no
              short side, so a held position is always long - but a flow that
              has not bought anything has no side at all. */}
          {topBotHasPosition && <span className="text-xs text-primary font-mono">LONG</span>}
        </div>
        <p className="text-ds-caption text-ds-text-secondary mt-2">
          {topBot
            ? topBotHasPosition
              ? `Allocated: $${(topBot.allocatedAmount || 0).toLocaleString()} · Confidence: ${topBot.confidence}%`
              : `Committed, not yet invested · Confidence: ${topBot.confidence}%`
            : 'Deploy a signal flow to see it here'}
        </p>
      </div>

      {/* Signal Flows (was a simulated Last Signal) */}
      <div className="bg-ds-surface-raised border border-ds-border rounded-2xl p-5 hover:border-ds-border-strong transition-colors duration-base ease-ds-out">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-ds-border flex items-center justify-center">
              <Zap size={16} className="text-ds-text-secondary" />
            </div>
            <span className="text-ds-caption font-bold uppercase tracking-widest text-ds-text-secondary">
              Signal Flows
            </span>
          </div>
        </div>
        {/* Set like every other figure in the grid, rather than as a filled
            chip. As a badge-buy block this was the loudest thing on the
            overview - a saturated fill at 2xl among six plain numbers - which
            made "how many flows are running" look like the headline metric
            when the P&L hero beside it is the headline. The count is still
            the largest text in the card; it just no longer shouts across the
            row. RUNNING moves down to the caption where the other cards keep
            their qualifiers. */}
        <p className="text-2xl font-bold text-ds-text font-mono tabular-nums">{runningCount}</p>
        <p className="text-ds-caption font-semibold uppercase tracking-widest text-ds-text-secondary mt-1">
          Running now
        </p>
        <p className="text-ds-caption text-ds-text-secondary mt-2">
          {pausedCount} paused · {bots.length} total
        </p>
      </div>

      {/* Capital Deployed (was a simulated Trades 24h) */}
      <div className="bg-ds-surface-raised border border-ds-border rounded-2xl p-5 hover:border-ds-border-strong transition-colors duration-base ease-ds-out">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-ds-border flex items-center justify-center">
            <TrendingUp size={16} className="text-ds-text-secondary" />
          </div>
          <span className="text-ds-caption font-bold uppercase tracking-widest text-ds-text-secondary">
            Capital Deployed
          </span>
        </div>
        <p className="text-2xl font-bold text-ds-text font-mono tabular-nums">
          ${totalAllocated.toLocaleString()}
        </p>
        <p className="text-ds-caption text-ds-text-secondary mt-2">
          {deployedShare.toFixed(0)}% of total capital
        </p>
      </div>

      {/* Drawdown — worst-performing open flow.

          The alert treatment is conditional now. This card used to be amber
          all the time: amber border, amber icon, amber figure, amber caption
          - while reading "0.0%" and "NORMAL". A card that looks like a
          warning when nothing is wrong teaches people to ignore it, so by the
          time the number does cross 5% the colour has stopped meaning
          anything. Below the threshold it now looks like every other metric;
          at or above it, the whole card turns. */}
      <div
        className={`rounded-2xl border p-5 transition-colors duration-base ease-ds-out ${
          alarmed
            ? 'border-ds-value-warning/40 bg-gradient-to-br from-ds-value-warning/5 to-ds-surface-raised hover:border-ds-value-warning/60'
            : 'border-ds-border bg-ds-surface-raised hover:border-ds-border-strong'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                alarmed ? 'bg-ds-value-warning/15' : 'bg-ds-border'
              }`}
            >
              <AlertTriangle
                size={16}
                className={alarmed ? 'text-ds-value-warning' : 'text-ds-text-secondary'}
              />
            </div>
            <span className="text-ds-caption font-bold uppercase tracking-widest text-ds-text-secondary">
              Drawdown
            </span>
          </div>
          {/* The status word carries the state on its own, so it stays
              coloured even when the rest of the card is calm - that is the
              one place the amber is still earning its meaning. */}
          <span
            className={`text-ds-caption font-semibold whitespace-nowrap ${
              alarmed ? 'text-ds-value-warning' : 'text-ds-text-muted'
            }`}
          >
            {alarmed ? 'NEAR LIMIT' : 'NORMAL'}
          </span>
        </div>
        <p
          className={`text-2xl font-bold font-mono tabular-nums ${
            alarmed ? 'text-ds-value-warning' : 'text-ds-text'
          }`}
        >
          {drawdownAbs.toFixed(1)}%
        </p>
        <p className="text-ds-caption text-ds-text-secondary mt-1">
          {worstBot ? `Worst flow: ${worstBot.pair}` : 'No flows yet'} · Alert fires at 5%
        </p>
        <div className="mt-3 h-1.5 bg-ds-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              alarmed
                ? 'bg-gradient-to-r from-ds-value-warning/70 to-ds-value-warning'
                : 'bg-gradient-to-r from-primary/60 to-primary'
            }`}
            style={{ width: `${Math.min(100, (drawdownAbs / 5) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
