/**
 * What a signal flow's position is, and what it has actually earned.
 *
 * This file replaces src/lib/bot-pnl.ts. That one produced a number from a
 * seeded random walk; this one derives it from fills that happened. Every
 * figure here traces to an order the platform placed and a fill a venue
 * reported, which is the property that makes the number payable.
 *
 * Pure and total: fills in, position out, no database, no clock, no network.
 * The money the platform owes its users is computed here, so it is testable
 * directly rather than only by standing up an exchange.
 *
 * ## Average cost, not FIFO
 *
 * Realized P&L uses weighted average cost. FIFO and LIFO are the alternatives,
 * and they give different realized figures for the same trades - the totals
 * converge once a position is fully closed, but the split between realized and
 * unrealized differs while it is open.
 *
 * Average cost is chosen because it is the only one of the three that does not
 * depend on lot identity. The platform's fills arrive from a venue that may
 * report them out of order and may split one logical trade across many, so
 * "which lot did this sell close" has no stable answer here. Average cost asks
 * a question the data can answer.
 *
 * ## Fees
 *
 * Charged against realized P&L, never netted into the average entry price.
 * Folding fees into cost basis makes the entry price a number that matches
 * nothing on the venue's own statement, which is the first thing anyone
 * reconciles against.
 */

import type { Fill, OrderSide } from './types';

export interface PositionState {
  /** Base asset held. Zero means flat. Never negative - this is spot, not margin. */
  quantity: number;
  /**
   * Weighted average price paid for the quantity currently held, excluding
   * fees. Zero when flat.
   */
  averageEntryPrice: number;
  /** Quote-currency profit or loss booked on quantity already sold, net of fees. */
  realizedPnl: number;
  /** Total fees paid, in quote currency, across every fill. */
  totalFees: number;
  /** Quote currency spent acquiring the quantity still held. */
  costBasis: number;
  /** Number of fills folded in, for reconciliation against the venue. */
  fillCount: number;
}

export const FLAT: PositionState = {
  quantity: 0,
  averageEntryPrice: 0,
  realizedPnl: 0,
  totalFees: 0,
  costBasis: 0,
  fillCount: 0,
};

/**
 * A fill reduced to what the maths needs.
 *
 * Deliberately not the full Fill: this keeps the arithmetic independent of
 * venue-shaped fields, so a test can express a case in six numbers rather
 * than by constructing a plausible exchange response.
 */
export interface PositionFill {
  side: OrderSide;
  quantity: number;
  price: number;
  /** Fee in quote currency. Convert before calling - see quoteFeeFromFill. */
  fee: number;
}

/**
 * A venue's fee, expressed in quote currency.
 *
 * Venues charge in whichever asset suits them: quote on a sell, base on a buy,
 * or a discount token. A base-asset fee is converted at the fill price, which
 * is the correct rate because it is the price at which that base was just
 * transacted. An unrecognised fee asset returns null rather than guessing -
 * silently treating a BNB fee as zero understates costs on every trade.
 */
export function quoteFeeFromFill(
  fill: Pick<Fill, 'feeAmount' | 'feeAsset' | 'price'>,
  baseAsset: string,
  quoteAsset: string
): number | null {
  if (!fill.feeAmount) return 0;
  const asset = fill.feeAsset.toUpperCase();
  if (asset === quoteAsset.toUpperCase()) return fill.feeAmount;
  if (asset === baseAsset.toUpperCase()) return fill.feeAmount * fill.price;
  return null;
}

/**
 * Fold one fill into a position.
 *
 * A buy raises the quantity and re-weights the average entry. A sell releases
 * cost basis at the average entry and books the difference as realized P&L.
 */
export function applyFill(state: PositionState, fill: PositionFill): PositionState {
  const { side, quantity, price, fee } = fill;

  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
    return state;
  }

  const feeAmount = Number.isFinite(fee) ? fee : 0;
  const totalFees = state.totalFees + feeAmount;
  const fillCount = state.fillCount + 1;

  if (side === 'buy') {
    const costBasis = state.costBasis + quantity * price;
    const newQuantity = state.quantity + quantity;
    return {
      quantity: newQuantity,
      averageEntryPrice: newQuantity > 0 ? costBasis / newQuantity : 0,
      // A buy realizes nothing. The fee is still a cost, so it is booked
      // against realized P&L immediately rather than deferred to the close -
      // the money has left the account either way.
      realizedPnl: state.realizedPnl - feeAmount,
      totalFees,
      costBasis,
      fillCount,
    };
  }

  /*
   * A sell larger than the position. Should not happen - orders are sized
   * against the held quantity - but a venue reporting fills out of order, or a
   * position rebuilt from a partial fill history, can produce it. Clamping to
   * the held quantity keeps the position from going negative, which would
   * silently model a short the platform has not taken.
   */
  const soldQuantity = Math.min(quantity, state.quantity);
  if (soldQuantity <= 0) {
    return { ...state, realizedPnl: state.realizedPnl - feeAmount, totalFees, fillCount };
  }

  const releasedCost = soldQuantity * state.averageEntryPrice;
  const proceeds = soldQuantity * price;
  const remainingQuantity = state.quantity - soldQuantity;
  const remainingCost = state.costBasis - releasedCost;

  return {
    quantity: remainingQuantity,
    // Average entry is unchanged by a sell under average-cost accounting -
    // until the position closes, when it resets so a re-entry starts clean.
    averageEntryPrice: remainingQuantity > 0 ? state.averageEntryPrice : 0,
    realizedPnl: state.realizedPnl + (proceeds - releasedCost) - feeAmount,
    totalFees,
    costBasis: remainingQuantity > 0 ? remainingCost : 0,
    fillCount,
  };
}

/**
 * Rebuild a position from its entire fill history.
 *
 * The authoritative computation. The stored Position row is a materialized
 * view of exactly this, the same relationship walletBalanceMinor has to the
 * ledger, and it is recomputed here rather than incremented so that a missed
 * or duplicated update cannot accumulate into a wrong number.
 *
 * Fills must be in venue order. Order matters: average entry depends on the
 * sequence of buys, so sorting by fill time is the caller's responsibility.
 */
export function positionFromFills(fills: PositionFill[]): PositionState {
  return fills.reduce(applyFill, FLAT);
}

/**
 * Profit or loss on the quantity still held, at a given mark price.
 *
 * Zero when flat. Unrealized by definition - it moves with the market and is
 * not owed to anyone until the position closes, which is why it is kept
 * separate from realizedPnl everywhere rather than summed into one figure.
 */
export function unrealizedPnl(state: PositionState, markPrice: number): number {
  if (state.quantity <= 0) return 0;
  if (!Number.isFinite(markPrice) || markPrice <= 0) return 0;
  return state.quantity * (markPrice - state.averageEntryPrice);
}

export interface PositionValuation {
  /** Booked, net of fees. This is the figure that may be settled to the ledger. */
  realizedPnl: number;
  /** Mark-to-market on the open quantity. Moves with price; owed to nobody yet. */
  unrealizedPnl: number;
  /** realized + unrealized. What the dashboard shows as the flow's P&L. */
  totalPnl: number;
  /** Quote-currency value of the open quantity at the mark. */
  marketValue: number;
  /**
   * Total P&L as a percentage of capital allocated to the flow, or null when
   * no capital was allocated. Null rather than zero: "no allocation" and "no
   * movement" are different states and a 0.0% on an unfunded flow reads as
   * the second.
   */
  pnlPercent: number | null;
}

/**
 * Value a position for display and for settlement.
 *
 * `allocatedCapital` is what the user committed to the flow, in quote
 * currency - the denominator for the percentage. It is passed in rather than
 * inferred from cost basis because a partially-deployed flow has a cost basis
 * smaller than its allocation, and dividing by cost basis would report a
 * flattering percentage on capital that was never at risk.
 */
export function valuePosition(
  state: PositionState,
  markPrice: number,
  allocatedCapital: number
): PositionValuation {
  const unrealized = unrealizedPnl(state, markPrice);
  const totalPnl = state.realizedPnl + unrealized;
  const marketValue = state.quantity > 0 && markPrice > 0 ? state.quantity * markPrice : 0;

  const hasAllocation = Number.isFinite(allocatedCapital) && allocatedCapital > 0;

  return {
    realizedPnl: state.realizedPnl,
    unrealizedPnl: unrealized,
    totalPnl,
    marketValue,
    pnlPercent: hasAllocation ? (totalPnl / allocatedCapital) * 100 : null,
  };
}

/**
 * Format a P&L percentage the way the dashboard shows it, e.g. '+4.2%'.
 *
 * Kept next to the maths so the sign convention has one definition. An
 * unfunded flow renders as '0.0%' with no sign - claiming '+0.0%' on a flow
 * that never traded implies a gain of zero rather than an absence of one.
 */
export function formatPnlPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '0.0%';
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}

/**
 * The quantity a flow may still sell.
 *
 * Trivial today, but it is the question every sell path asks, and having one
 * answer stops a rounding difference between two call sites producing an order
 * for marginally more than is held.
 */
export function sellableQuantity(state: PositionState): number {
  return Math.max(0, state.quantity);
}
