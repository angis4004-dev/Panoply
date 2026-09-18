/**
 * Every figure the Overview derives from the trader's signal flows, in one place.
 *
 * These totals used to be computed inline in the metrics grid. The redesigned
 * Overview reads them from several cards at once - the P&L card, the flow
 * dots, the confidence gauge, the deployed ring, the drawdown bar - and a sum
 * written twice is a sum that eventually disagrees with itself. So it is
 * written once, here, and tested.
 *
 * The semantics are carried over from the grid unchanged. Where a rule looks
 * arbitrary the reason is noted beside it.
 */

/** Drawdown at or beyond this, in percent, turns the drawdown card amber. */
export const DRAWDOWN_ALERT_PERCENT = 5;

/** The fields of a flow this module reads. A subset of the store's Bot. */
export interface FlowLike {
  pair: string;
  status: string;
  confidence: number;
  /** Rounded percent string, e.g. "+4.2%". Only a fallback; see below. */
  pnl: string;
  allocatedAmount?: number | null;
  /** Unrounded modelled P&L in dollars, now. */
  realizedPnlDollar?: number;
  /** The same figure 24 hours earlier. */
  pnlDollarDayAgo?: number;
  /** The same figure 7 days earlier. */
  pnlDollarWeekAgo?: number;
  /** Capital plus accrued P&L; zero while the flow holds nothing. */
  marketValue?: number;
}

export interface FlowSummary {
  count: number;
  runningCount: number;
  pausedCount: number;
  totalAllocated: number;
  totalPnlDollar: number;
  /** Total P&L as a share of allocated capital. Zero when nothing is allocated. */
  pnlPercent: number;
  /** P&L gained over the last 24 hours, or null when the API did not send it. */
  pnlToday: number | null;
  /** P&L gained over the last 7 days, or null when the API did not send it. */
  pnlWeek: number | null;
  /** Per flow, in input order: is it in profit. */
  profitable: boolean[];
  profitableCount: number;
  /** Share of flows in profit, 0 to 100. */
  profitableRate: number;
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
  largest: {
    pair: string;
    allocated: number;
    confidence: number;
    /** Share of all deployed capital held by this flow, 0 to 100. */
    shareOfDeployed: number;
    /** Whether it currently holds anything; allocating does not open a position. */
    hasPosition: boolean;
    /** What it is worth now, capital plus modelled P&L. */
    value: number;
  } | null;
  worst: { pair: string; drawdownPercent: number } | null;
  /** The worst flow's loss, as a positive percent. Zero when no flow is down. */
  drawdownPercent: number;
  drawdownAlarmed: boolean;
  /**
   * Allocated capital as a share of allocated plus wallet, 0 to 100.
   *
   * Vault investments are deliberately outside this ratio, as they were on the
   * card it came from: it answers "how much of what I could put into flows is
   * in flows", not "how much of everything is invested".
   */
  deployedShare: number;
}

export function parsePnlPercent(pnl: string): number {
  const n = parseFloat(pnl.replace('%', ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * A flow's modelled dollar P&L.
 *
 * Prefers the unrounded figure. `pnl` is rounded to one decimal, so summing
 * it across many flows compounds a rounding error that grows with capital;
 * it is only used if an older response shape slips through without the
 * dollar field.
 */
function pnlDollar(flow: FlowLike): number {
  return flow.realizedPnlDollar ?? (flow.allocatedAmount ?? 0) * (parsePnlPercent(flow.pnl) / 100);
}

function sumOrNull(flows: FlowLike[], field: 'pnlDollarDayAgo' | 'pnlDollarWeekAgo') {
  // All or nothing: a delta summed over only the flows that reported it would
  // understate the period and look like a real figure.
  if (flows.length === 0) return 0;
  if (flows.some((f) => typeof f[field] !== 'number' || f.realizedPnlDollar === undefined)) {
    return null;
  }
  return flows.reduce((sum, f) => sum + (f.realizedPnlDollar as number) - (f[field] as number), 0);
}

export function summarizeFlows(flows: FlowLike[], walletBalance: number): FlowSummary {
  const count = flows.length;
  const totalAllocated = flows.reduce((sum, f) => sum + (f.allocatedAmount || 0), 0);
  const totalPnlDollar = flows.reduce((sum, f) => sum + pnlDollar(f), 0);

  // Profitable is judged on the dollar figure where there is one, so a flow at
  // +$0.04 counts even though its rounded percent reads "+0.0%".
  const profitable = flows.map((f) => (f.realizedPnlDollar ?? parsePnlPercent(f.pnl)) > 0);
  const profitableCount = profitable.filter(Boolean).length;

  const confidences = flows.map((f) => f.confidence);
  const avgConfidence = count > 0 ? confidences.reduce((a, b) => a + b, 0) / count : 0;

  // First of equals wins, as before, so the card does not flip between two
  // flows of the same size from one poll to the next.
  const top = flows.reduce<FlowLike | null>(
    (best, f) => (!best || (f.allocatedAmount || 0) > (best.allocatedAmount || 0) ? f : best),
    null
  );
  const largest = top
    ? {
        pair: top.pair,
        allocated: top.allocatedAmount || 0,
        confidence: top.confidence,
        shareOfDeployed:
          totalAllocated > 0 ? ((top.allocatedAmount || 0) / totalAllocated) * 100 : 0,
        hasPosition: (top.marketValue ?? 0) > 0,
        value: (top.allocatedAmount || 0) * (1 + parsePnlPercent(top.pnl) / 100),
      }
    : null;

  const bottom = flows.reduce<FlowLike | null>(
    (worst, f) => (!worst || parsePnlPercent(f.pnl) < parsePnlPercent(worst.pnl) ? f : worst),
    null
  );
  const drawdownPercent = bottom ? Math.max(0, -parsePnlPercent(bottom.pnl)) : 0;

  return {
    count,
    runningCount: flows.filter((f) => f.status === 'running').length,
    pausedCount: flows.filter((f) => f.status === 'paused').length,
    totalAllocated,
    totalPnlDollar,
    pnlPercent: totalAllocated > 0 ? (totalPnlDollar / totalAllocated) * 100 : 0,
    pnlToday: sumOrNull(flows, 'pnlDollarDayAgo'),
    pnlWeek: sumOrNull(flows, 'pnlDollarWeekAgo'),
    profitable,
    profitableCount,
    profitableRate: count > 0 ? (profitableCount / count) * 100 : 0,
    avgConfidence,
    minConfidence: count > 0 ? Math.min(...confidences) : 0,
    maxConfidence: count > 0 ? Math.max(...confidences) : 0,
    largest,
    worst: bottom ? { pair: bottom.pair, drawdownPercent } : null,
    drawdownPercent,
    drawdownAlarmed: drawdownPercent >= DRAWDOWN_ALERT_PERCENT,
    deployedShare:
      totalAllocated + walletBalance > 0
        ? (totalAllocated / (totalAllocated + walletBalance)) * 100
        : 0,
  };
}
