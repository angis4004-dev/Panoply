import mongoose from 'mongoose';
import { ExchangeOrderModel } from '@/lib/models/ExchangeOrder';
import { getExchange } from './index';
import {
  applyFill,
  positionFromFills,
  valuePosition,
  formatPnlPercent,
  FLAT,
  type PositionFill,
  type PositionState,
  type PositionValuation,
} from './position';

/**
 * A signal flow's real position and real P&L, rebuilt from its fills.
 *
 * This is what replaces src/lib/bot-pnl.ts. Every figure traces to an order
 * the platform placed and a fill a venue reported, so the dashboard number is
 * a claim the platform can substantiate rather than a random walk.
 *
 * Recomputed from the order history on every read rather than incremented into
 * a stored total. That costs a query and buys the property that matters most
 * here: a missed update, a duplicated webhook or a crashed job cannot leave a
 * permanently wrong number behind. It is the same relationship
 * walletBalanceMinor has to the ledger.
 */

export interface FlowPnl {
  position: PositionState;
  valuation: PositionValuation;
  /** Formatted the way the dashboard shows it, e.g. '+4.2%'. */
  pnlLabel: string;
  /** Mark price used, or null when no price was available. */
  markPrice: number | null;
  /** Highest mark seen while the position has been open, for trailing stops. */
  peakPrice: number | null;
  /** True when no order has ever been placed for this flow. */
  neverTraded: boolean;
}

/**
 * Every fill for a flow, oldest first.
 *
 * The sort is not cosmetic: average entry depends on the order of buys, so
 * folding fills in the wrong sequence produces a different - wrong - cost
 * basis. Sorted by the fill's own timestamp rather than the order's, because a
 * single order's fills can straddle another order's.
 */
export async function fillsForBot(
  botId: string | mongoose.Types.ObjectId
): Promise<PositionFill[]> {
  const orders = await ExchangeOrderModel.find({
    botId,
    // Rejected and submitting orders never moved anything. Including them
    // would fold phantom quantity into the position.
    status: { $in: ['open', 'partial', 'filled', 'cancelled'] },
  })
    .select('side fills')
    .lean();

  const fills: Array<PositionFill & { at: number }> = [];

  for (const order of orders) {
    for (const fill of order.fills ?? []) {
      fills.push({
        side: order.side,
        quantity: fill.quantity,
        price: fill.price,
        /*
         * feeQuote is null when the venue charged in an asset that could not
         * be converted. Treated as zero here, which understates costs - but
         * the alternative is refusing to value the position at all. The null
         * is preserved on the order row so the discrepancy is visible rather
         * than lost.
         */
        fee: fill.feeQuote ?? 0,
        at: new Date(fill.filledAt).getTime(),
      });
    }
  }

  fills.sort((a, b) => a.at - b.at);
  return fills.map(({ at: _at, ...fill }) => fill);
}

/**
 * The peak mark price while the current position has been open.
 *
 * Derived from fill prices rather than stored, so it survives a restart and
 * cannot drift from the order history. It is an approximation: the true peak
 * is the highest price the market reached, and this only sees prices at which
 * the flow transacted plus the current mark. A trailing stop built on it
 * therefore triggers no earlier than a perfect one would, never later - which
 * is the safe direction for the error to run.
 */
function peakFromFills(fills: PositionFill[], currentPrice: number | null): number | null {
  if (fills.length === 0) return null;
  const prices = fills.map((fill) => fill.price);
  if (currentPrice && currentPrice > 0) prices.push(currentPrice);
  return Math.max(...prices);
}

/**
 * Value one flow now.
 *
 * `allocatedCapital` is the denominator for the percentage - what the trader
 * committed, not what has been deployed. See valuePosition for why.
 *
 * A price lookup failure does not throw. The position is still real and worth
 * showing; only the unrealized half is unknown, so it comes back with a null
 * mark and unrealized P&L of zero rather than taking the dashboard down.
 */
export async function computeFlowPnl(
  botId: string | mongoose.Types.ObjectId,
  pair: string,
  allocatedCapital: number
): Promise<FlowPnl> {
  const fills = await fillsForBot(botId);

  if (fills.length === 0) {
    return {
      position: FLAT,
      valuation: valuePosition(FLAT, 0, allocatedCapital),
      pnlLabel: formatPnlPercent(allocatedCapital > 0 ? 0 : null),
      markPrice: null,
      peakPrice: null,
      neverTraded: true,
    };
  }

  const position = positionFromFills(fills);

  let markPrice: number | null = null;
  try {
    const { adapter } = getExchange();
    markPrice = (await adapter.getTicker(pair)).price;
  } catch (error) {
    // Realized P&L is unaffected by a missing price - it is already booked.
    console.error(`[pnl] Could not price ${pair}:`, error instanceof Error ? error.message : error);
  }

  const valuation = valuePosition(position, markPrice ?? 0, allocatedCapital);

  return {
    position,
    valuation,
    pnlLabel: formatPnlPercent(valuation.pnlPercent),
    markPrice,
    peakPrice: peakFromFills(fills, markPrice),
    neverTraded: false,
  };
}

/**
 * Realized P&L for a flow at each of a series of instants.
 *
 * Exact, not modelled: the fills are replayed in order and the running
 * realized figure is sampled at each timestamp. The old bot-pnl.ts could
 * generate a value for any moment because the walk was a function of time;
 * this can only report what actually happened, which is the point.
 *
 * Realized only. Reconstructing unrealized P&L at a past instant needs the
 * mark price at that instant, and the platform does not store price history -
 * so rather than interpolate a plausible-looking curve, the series reports the
 * booked figure and steps at each close. That produces a flat line between
 * trades, which is honest: nothing was realized between them.
 */
export async function realizedPnlSeries(
  botId: string | mongoose.Types.ObjectId,
  sampleTimes: number[]
): Promise<number[]> {
  const orders = await ExchangeOrderModel.find({
    botId,
    status: { $in: ['open', 'partial', 'filled', 'cancelled'] },
  })
    .select('side fills')
    .lean();

  const timed: Array<PositionFill & { at: number }> = [];
  for (const order of orders) {
    for (const fill of order.fills ?? []) {
      timed.push({
        side: order.side,
        quantity: fill.quantity,
        price: fill.price,
        fee: fill.feeQuote ?? 0,
        at: new Date(fill.filledAt).getTime(),
      });
    }
  }
  timed.sort((a, b) => a.at - b.at);

  if (timed.length === 0) return sampleTimes.map(() => 0);

  /*
   * One pass over the fills, advancing through the sample times as it goes.
   * Both are sorted, so this is linear rather than re-folding the whole
   * history at every sample - which on a busy flow with a year of samples is
   * the difference between a chart and a timeout.
   */
  const series: number[] = [];
  let state = FLAT;
  let cursor = 0;

  for (const sampleAt of sampleTimes) {
    while (cursor < timed.length && timed[cursor].at <= sampleAt) {
      const { at: _at, ...fill } = timed[cursor];
      state = applyFill(state, fill);
      cursor += 1;
    }
    series.push(state.realizedPnl);
  }

  return series;
}

/**
 * Total quote-currency value of everything a trader currently holds across
 * every flow, for the exposure limit.
 *
 * Uses cost basis rather than market value, deliberately. Market value would
 * make the exposure ceiling move with the market: a rally would consume
 * headroom the trader never chose to use and block new orders, and a crash
 * would free headroom precisely when adding risk is least wise. Cost basis
 * measures what was committed, which is what the limit is about.
 */
export async function userExposure(userId: string | mongoose.Types.ObjectId): Promise<number> {
  const orders = await ExchangeOrderModel.find({
    userId,
    status: { $in: ['open', 'partial', 'filled', 'cancelled'] },
  })
    .select('botId side fills')
    .lean();

  const byBot = new Map<string, Array<PositionFill & { at: number }>>();

  for (const order of orders) {
    const key = String(order.botId);
    const list = byBot.get(key) ?? [];
    for (const fill of order.fills ?? []) {
      list.push({
        side: order.side,
        quantity: fill.quantity,
        price: fill.price,
        fee: fill.feeQuote ?? 0,
        at: new Date(fill.filledAt).getTime(),
      });
    }
    byBot.set(key, list);
  }

  let total = 0;
  for (const list of byBot.values()) {
    list.sort((a, b) => a.at - b.at);
    total += positionFromFills(list.map(({ at: _at, ...fill }) => fill)).costBasis;
  }
  return total;
}

/**
 * Platform-wide realized loss booked today, in minor units, as a positive
 * number. Zero when the platform is up on the day.
 *
 * Scoped to UTC midnight rather than a rolling window: an operator asking
 * "how much have we lost today" means the calendar day, and a rolling
 * twenty-four hours would let the limit reset gradually and invisibly.
 */
export async function realizedLossTodayMinor(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const cutoff = startOfDay.getTime();

  const touchedToday = await ExchangeOrderModel.find({
    status: { $in: ['partial', 'filled'] },
    submittedAt: { $gte: startOfDay },
  })
    .select('botId')
    .lean();

  if (touchedToday.length === 0) return 0;

  const affectedBots = [...new Set(touchedToday.map((order) => String(order.botId)))];

  /*
   * Realized P&L needs a whole position's history, not just today's fills: a
   * sell today closes quantity bought last week, and the cost basis lives
   * back there. So today's contribution is the difference between each flow's
   * realized P&L now and what it was at midnight - computed by folding the
   * same ordered fill list twice, once truncated to the fills that predate
   * the cutoff.
   */
  let netRealizedToday = 0;

  for (const botId of affectedBots) {
    const fills = await fillsForBot(botId);
    if (fills.length === 0) continue;

    const priorFills = await fillsBefore(botId, cutoff);

    netRealizedToday +=
      positionFromFills(fills).realizedPnl - positionFromFills(priorFills).realizedPnl;
  }

  // Positive number, or zero when the platform is up on the day.
  return netRealizedToday < 0 ? Math.round(-netRealizedToday * 100) : 0;
}

/** A flow's fills from before `cutoff`, oldest first. */
async function fillsBefore(
  botId: string | mongoose.Types.ObjectId,
  cutoff: number
): Promise<PositionFill[]> {
  const all = await ExchangeOrderModel.find({
    botId,
    status: { $in: ['open', 'partial', 'filled', 'cancelled'] },
  })
    .select('side fills')
    .lean();

  const fills: Array<PositionFill & { at: number }> = [];
  for (const order of all) {
    for (const fill of order.fills ?? []) {
      const at = new Date(fill.filledAt).getTime();
      if (at >= cutoff) continue;
      fills.push({
        side: order.side,
        quantity: fill.quantity,
        price: fill.price,
        fee: fill.feeQuote ?? 0,
        at,
      });
    }
  }

  fills.sort((a, b) => a.at - b.at);
  return fills.map(({ at: _at, ...fill }) => fill);
}
