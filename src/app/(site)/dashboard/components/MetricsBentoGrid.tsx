'use client';

import React from 'react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { useAppStore, type Bot } from '@/store/app-store';
import { DRAWDOWN_ALERT_PERCENT, summarizeFlows, type FlowSummary } from '@/lib/flow-summary';
import {
  BuilderIcon,
  ConfidenceIcon,
  DeployIcon,
  DrawdownIcon,
  FlowsIcon,
  PnlIcon,
  ProfitIcon,
} from '@/components/ui/panoply-icons';
import { AlertBar, FlowDots, Gauge, Ring } from '@/components/dashboard/card-marks';
import { ChangingValue } from '@/components/ui/changing-value';
import {
  CARD_FIGURE,
  CARD_FIGURE_BIG,
  CARD_LABEL,
  CARD_META,
  CardChip,
  OverviewCard,
  money,
  toneOf,
} from '@/components/dashboard/overview-card';

/*
 * The Overview's metric cards.
 *
 * Each card states its figure and draws it: dots for which flows are in
 * profit, a gauge for confidence, a ring for capital at work, a bar with the
 * alert threshold for drawdown. Every drawing reads a number the card already
 * has; the arithmetic is in lib/flow-summary so the cards cannot disagree.
 *
 * Split in two so the cards can be rendered from plain values: MetricCards is
 * the view, the default export reads the store and handles loading and error.
 */

type DeltaDir = 'up' | 'down' | 'neutral' | 'warn';

/** The direction arrow stays, so up and down are told apart without colour. */
function DeltaBadge({ delta, dir }: { delta: string; dir: DeltaDir }) {
  const styles = {
    up: 'text-ds-value-positive bg-ds-value-positive/10',
    down: 'text-ds-value-negative bg-ds-value-negative/10',
    neutral: 'text-ds-text-secondary bg-white/[0.06]',
    warn: 'text-ds-value-warning bg-ds-value-warning/10',
  };
  const icons = {
    up: <TrendingUp size={11} aria-hidden />,
    down: <TrendingDown size={11} aria-hidden />,
    neutral: null,
    warn: <AlertTriangle size={11} aria-hidden />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-xs font-medium tabular-nums ${styles[dir]}`}
    >
      {icons[dir]}
      {delta}
    </span>
  );
}

function Period({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-[11.5px] text-ds-text-muted">{label}</span>
      <span className={`font-mono text-sm font-medium tabular-nums ${toneOf(value)}`}>
        <ChangingValue text={money(value, { signed: true })} />
      </span>
    </div>
  );
}

const SHORT = 'md:min-h-[236px]';

export function MetricCards({ flows, summary }: { flows: Bot[]; summary: FlowSummary }) {
  const {
    count,
    totalAllocated,
    totalPnlDollar,
    pnlPercent,
    largest,
    worst,
    drawdownPercent,
    drawdownAlarmed,
  } = summary;
  const pnlDir: DeltaDir = totalPnlDollar > 0 ? 'up' : totalPnlDollar < 0 ? 'down' : 'neutral';
  const listed = flows.slice(0, 4);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      {/* Modelled P&L, across two columns.

          Named "Modelled", not "Realized". Realized P&L is a term of art: it
          means gains booked when a position closed. Nothing here closed a
          position, because nothing opened one - the figure is produced by the
          deterministic model in src/lib/performance-model.ts and no order is
          ever sent to a venue. Showing a generated number under the industry
          term for a booked one is the single most misleading thing this
          dashboard could do, so the label says what the number is. What the
          model is and how it differs from executed trading is set out on the
          About page under Transparency.

          The glow sits top right, where a flat grey quarter-circle used to. */}
      <OverviewCard glow="corner" className={`col-span-2 ${SHORT}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <CardChip lit>
              <PnlIcon />
            </CardChip>
            <span className={CARD_LABEL}>Modelled P&amp;L</span>
          </div>
          <DeltaBadge delta={`${Math.abs(pnlPercent).toFixed(1)}%`} dir={pnlDir} />
        </div>
        <p className={`${CARD_FIGURE_BIG} text-primary`}>
          <ChangingValue text={money(totalPnlDollar, { signed: true })} mutedDecimals />
        </p>
        <p className={CARD_META}>
          {count} signal flow{count === 1 ? '' : 's'} · {money(totalAllocated, { decimals: 0 })}{' '}
          deployed
        </p>
        {count > 0 && summary.pnlToday !== null && summary.pnlWeek !== null && (
          <div className="mt-auto grid grid-cols-3 gap-3 border-t border-ds-border pt-3">
            <Period label="Today" value={summary.pnlToday} />
            <Period label="This week" value={summary.pnlWeek} />
            <Period label="Since first flow" value={totalPnlDollar} />
          </div>
        )}
      </OverviewCard>

      {/* Profitable flows (was a simulated Win Rate). */}
      <OverviewCard className={SHORT}>
        <div className="flex items-center justify-between gap-2">
          <CardChip>
            <ProfitIcon />
          </CardChip>
          <DeltaBadge
            delta={`${summary.profitableCount}/${count}`}
            dir={count === 0 ? 'neutral' : summary.profitableRate >= 50 ? 'up' : 'down'}
          />
        </div>
        <p className={CARD_FIGURE}>
          <ChangingValue text={`${summary.profitableRate.toFixed(0)}%`} />
        </p>
        <span className={CARD_LABEL}>Profitable flows</span>
        <div className="mt-auto grid gap-2">
          <FlowDots flags={summary.profitable} />
          <p className="text-xs text-ds-text-muted">
            {count > 0 ? 'One dot per flow, filled when in profit' : 'Dots appear as flows run'}
          </p>
        </div>
      </OverviewCard>

      {/* Average confidence. */}
      <OverviewCard className={SHORT}>
        <CardChip>
          <ConfidenceIcon />
        </CardChip>
        <div className="flex items-end justify-between gap-2">
          <p className={CARD_FIGURE}>
            <ChangingValue text={`${summary.avgConfidence.toFixed(0)}%`} />
          </p>
          <Gauge
            value={summary.avgConfidence}
            className="h-[40px] w-[72px] shrink-0 sm:h-[58px] sm:w-[104px]"
          />
        </div>
        <span className={CARD_LABEL}>Avg confidence</span>
        <p className="mt-auto text-xs text-ds-text-muted">
          {count > 1
            ? `Range ${summary.minConfidence} to ${summary.maxConfidence}% across ${count} flows`
            : count === 1
              ? 'One flow'
              : 'No flows yet'}
        </p>
      </OverviewCard>

      {/* Largest allocation, or its open position once it holds one.
          Allocating capital does not open a position - the flow has to decide
          to buy - so it is only called a position when it holds something. */}
      <OverviewCard className={SHORT}>
        <div className="flex min-w-0 items-center gap-3">
          <CardChip>
            <BuilderIcon />
          </CardChip>
          <span className={CARD_LABEL}>
            {largest?.hasPosition ? 'Active position' : 'Largest allocation'}
          </span>
        </div>
        <p className={CARD_FIGURE}>
          <ChangingValue
            text={money(largest ? (largest.hasPosition ? largest.value : largest.allocated) : 0)}
            mutedDecimals
          />
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-xs text-ds-text-secondary">
            {largest?.pair ?? 'No flows yet'}
          </span>
          {largest && (
            <span className="font-mono text-xs tabular-nums text-ds-text-muted">
              {largest.shareOfDeployed.toFixed(0)}% of deployed
            </span>
          )}
        </div>
        <div className="mt-auto grid gap-2">
          <p className="text-xs text-ds-text-muted">
            {largest
              ? largest.hasPosition
                ? `Confidence ${largest.confidence}%`
                : `Committed, not yet invested · Confidence ${largest.confidence}%`
              : 'Deploy a signal flow to see it here'}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/45 to-primary transition-[width] duration-[400ms] ease-ds-out motion-reduce:transition-none"
              style={{ width: `${largest?.shareOfDeployed ?? 0}%` }}
            />
          </div>
        </div>
      </OverviewCard>

      {/* Signal flows (was a simulated Last Signal): the count, and each flow. */}
      <OverviewCard className={SHORT}>
        <div className="flex min-w-0 items-center gap-3">
          <CardChip>
            <FlowsIcon />
          </CardChip>
          <span className={CARD_LABEL}>Signal flows</span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <p className={CARD_FIGURE}>
            <ChangingValue text={String(summary.runningCount)} />
          </p>
          <span className={`${CARD_LABEL} pb-1`}>Running now</span>
        </div>
        <ul className="mt-auto grid gap-1.5 font-mono text-xs text-ds-text-secondary">
          {count === 0 && <li className="text-ds-text-muted">No flows yet</li>}
          {listed.map((flow) => {
            const running = flow.status === 'running';
            return (
              <li key={flow.id} className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className={
                    running
                      ? 'h-[7px] w-[7px] shrink-0 rounded-full bg-ds-value-positive shadow-[0_0_8px_rgba(0,212,170,0.6)]'
                      : 'h-[7px] w-[7px] shrink-0 rounded-full border-[1.5px] border-ds-text-muted'
                  }
                />
                <span className={`truncate ${running ? '' : 'text-ds-text-muted'}`}>
                  {flow.pair}
                  {!running && ` · ${flow.status}`}
                </span>
              </li>
            );
          })}
          {count > listed.length && (
            <li className="text-ds-text-muted">+{count - listed.length} more</li>
          )}
        </ul>
      </OverviewCard>

      {/* Capital deployed (was a simulated Trades 24h). */}
      <OverviewCard className={SHORT}>
        <div className="flex min-w-0 items-center gap-3">
          <CardChip>
            <DeployIcon />
          </CardChip>
          <span className={CARD_LABEL}>Capital deployed</span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <p className={CARD_FIGURE}>
            <ChangingValue text={money(totalAllocated, { decimals: 0 })} />
          </p>
          <Ring
            value={summary.deployedShare}
            className="h-11 w-11 shrink-0 sm:h-[58px] sm:w-[58px]"
          />
        </div>
        <p className={`mt-auto ${CARD_META}`}>
          {summary.deployedShare.toFixed(0)}% of your capital is working in flows
        </p>
      </OverviewCard>

      {/* Drawdown, worst-performing flow.

          The alert treatment is conditional. This card used to be amber all
          the time, while reading "0.0%" and "NORMAL". A card that looks like a
          warning when nothing is wrong teaches people to ignore it, so by the
          time the number does cross the threshold the colour has stopped
          meaning anything. Below it this looks like every other card; at or
          above it, the card turns. */}
      <OverviewCard
        className={`${SHORT} ${drawdownAlarmed ? '!border-ds-value-warning/40 bg-gradient-to-br from-ds-value-warning/5 to-transparent' : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-3">
            <CardChip lit={drawdownAlarmed}>
              <DrawdownIcon />
            </CardChip>
            <span className={CARD_LABEL}>Drawdown</span>
          </div>
          {/* The status word carries the state on its own, so it stays
              coloured even when the rest of the card is calm. */}
          <span
            className={`whitespace-nowrap text-xs font-semibold uppercase tracking-[0.12em] ${
              drawdownAlarmed ? 'text-ds-value-warning' : 'text-ds-value-positive'
            }`}
          >
            {drawdownAlarmed ? 'Near limit' : 'Normal'}
          </span>
        </div>
        <p className={`${CARD_FIGURE} ${drawdownAlarmed ? '!text-ds-value-warning' : ''}`}>
          <ChangingValue text={`${drawdownPercent.toFixed(1)}%`} />
        </p>
        <p className={CARD_META}>{worst ? `Worst flow, ${worst.pair}` : 'No flows yet'}</p>
        <div className="mt-auto">
          <AlertBar
            value={drawdownPercent}
            alert={DRAWDOWN_ALERT_PERCENT}
            max={DRAWDOWN_ALERT_PERCENT * 2}
            alarmed={drawdownAlarmed}
          />
        </div>
      </OverviewCard>
    </div>
  );
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
      <div className="mb-4 rounded-xl border border-ds-value-negative/30 bg-ds-value-negative/5 p-5">
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
    // Same shapes and spans as the cards, so nothing moves when they arrive.
    return (
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {[...Array(7)].map((_, i) => (
          <div
            key={i}
            className={`animate-pulse rounded-2xl border border-ds-border bg-ds-surface-raised/60 p-5 ${SHORT} ${
              i === 0 ? 'col-span-2' : ''
            }`}
          >
            <div className="mb-3 h-[34px] w-[34px] rounded-[9px] bg-ds-border" />
            <div className="mb-2 h-6 w-20 rounded bg-ds-border" />
            <div className="h-3 w-28 rounded bg-ds-border" />
          </div>
        ))}
      </div>
    );
  }

  return <MetricCards flows={bots} summary={summarizeFlows(bots, walletBalance)} />;
}
