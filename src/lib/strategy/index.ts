import { sellableQuantity } from '@/lib/exchange/position';
import { canAffordOrder, undeployedCapital, type Intent, type StrategyContext } from './types';

/**
 * What each signal flow decides to do.
 *
 * Pure functions, one per strategy, dispatched by kind. Every branch returns
 * an intent with a reason attached; none of them place an order.
 *
 * These are deliberately simple, mechanical strategies. They are not
 * predictive models and nothing here claims an edge - each one is a rule about
 * when to buy and when to sell that a person could follow with a calculator.
 * That is the honest thing to ship: a real strategy the platform actually
 * executes, rather than a sophisticated-sounding one that does not exist.
 */

export * from './types';

/** How often a DCA flow buys. Fixed rather than configurable, for now. */
const DCA_INTERVAL_HOURS = 24;

/**
 * Fraction of remaining capital a DCA flow commits per buy.
 *
 * A twentieth, so a flow spreads entry across roughly twenty purchases - which
 * is the entire point of dollar-cost averaging. Confidence tilts it slightly:
 * a high-conviction flow deploys a little faster, but not enough to turn DCA
 * into a single lump-sum purchase, because then it would not be DCA.
 */
function dcaSliceFraction(confidence: number): number {
  const c = Math.max(0, Math.min(100, confidence)) / 100;
  return 0.04 + c * 0.03; // 4% to 7% of remaining capital
}

/**
 * Dollar-cost averaging: buy a slice at a fixed interval until the allocation
 * is deployed, then hold.
 *
 * No sell rule at all, which is correct for DCA and worth being explicit
 * about: the strategy is an accumulation plan, and exiting is the trader's
 * decision to close the flow. A DCA bot that sold on its own would be a
 * different strategy wearing the name.
 */
function decideDca(context: StrategyContext): Intent {
  const { state, now } = context;
  const remaining = undeployedCapital(context);

  if (remaining <= 0) {
    return { action: 'hold', reason: 'Allocation fully deployed; holding.' };
  }

  const since = state.lastOrderAt ?? state.startedAt;
  const hoursElapsed = (now.getTime() - since.getTime()) / 3_600_000;
  if (hoursElapsed < DCA_INTERVAL_HOURS) {
    const wait = (DCA_INTERVAL_HOURS - hoursElapsed).toFixed(1);
    return { action: 'hold', reason: `Next scheduled buy in ${wait}h.` };
  }

  const fraction = dcaSliceFraction(state.confidence);
  const slice = state.allocatedCapital * fraction;
  /*
   * Spend the remainder rather than leaving a stub too small to trade. Without
   * this a flow finishes with a few dollars of undeployed capital that can
   * never meet the venue minimum, and retries forever.
   */
  const amount = Math.min(slice, remaining);
  const isFinalTranche = amount >= remaining;

  if (!canAffordOrder(context, amount)) {
    return {
      action: 'hold',
      reason: `Remaining capital is below the ${context.rules.pair} minimum order size.`,
    };
  }

  return {
    action: 'buy',
    quoteAmount: amount,
    // The wording follows what is actually being spent. Reporting "5.5% of
    // allocation" while spending the last 1.5% of it would put a number in
    // the trader's order history that does not match the order.
    reason: isFinalTranche
      ? 'Final DCA purchase, deploying the remaining allocation.'
      : `Scheduled DCA purchase of ${(fraction * 100).toFixed(1)}% of allocation.`,
  };
}

/**
 * How far price must fall from its peak before a trailing stop sells.
 *
 * Scales with confidence: a high-conviction flow is given more room to breathe
 * before it gives up, and a low-conviction one is cut quickly. 5% at zero
 * confidence up to 12% at full.
 */
function trailingStopDistance(confidence: number): number {
  const c = Math.max(0, Math.min(100, confidence)) / 100;
  return 0.05 + c * 0.07;
}

/**
 * Trailing stop: enter once, then ride the position and sell the whole thing
 * when price falls a set distance from its high-water mark.
 *
 * `peakPrice` is state the executor persists, not something recomputed here -
 * the peak is the highest price seen while the position was open, and that
 * cannot be derived from the current tick.
 */
function decideTrailingStop(context: StrategyContext): Intent {
  const { state, position, ticker } = context;
  const held = sellableQuantity(position);
  const price = ticker.price;

  if (held <= 0) {
    const remaining = undeployedCapital(context);
    if (!canAffordOrder(context, remaining)) {
      return {
        action: 'hold',
        reason: `Allocation is below the ${context.rules.pair} minimum order size.`,
      };
    }
    return {
      action: 'buy',
      quoteAmount: remaining,
      reason: 'Opening the position; trailing stop will arm from here.',
    };
  }

  // Until a peak is recorded, the entry is the best reference available.
  const peak = Math.max(state.peakPrice ?? 0, position.averageEntryPrice, price);
  const distance = trailingStopDistance(state.confidence);
  const trigger = peak * (1 - distance);

  if (price <= trigger) {
    return {
      action: 'sell',
      quantity: held,
      reason: `Price ${price.toFixed(2)} fell ${(distance * 100).toFixed(1)}% below the peak of ${peak.toFixed(2)}; closing.`,
    };
  }

  const room = ((price - trigger) / price) * 100;
  return {
    action: 'hold',
    reason: `Holding; ${room.toFixed(1)}% above the trailing stop at ${trigger.toFixed(2)}.`,
  };
}

/** Band width either side of the average entry that a grid trades within. */
function gridBand(confidence: number): number {
  const c = Math.max(0, Math.min(100, confidence)) / 100;
  return 0.03 + c * 0.04; // 3% to 7%
}

/**
 * Grid: accumulate on dips, take profit on rallies, around the position's own
 * average entry.
 *
 * A simplification of a true grid, which rests a ladder of limit orders at
 * fixed intervals. This version evaluates one band per cycle at market. The
 * difference is honest to state: a real grid captures oscillation between
 * cycles, this one only sees the price at the moment it runs, so it will miss
 * moves that reverse inside one interval. Resting ladders need order lifecycle
 * management the executor does not have yet.
 */
function decideGrid(context: StrategyContext): Intent {
  const { state, position, ticker } = context;
  const held = sellableQuantity(position);
  const price = ticker.price;
  const band = gridBand(state.confidence);

  if (held <= 0) {
    const remaining = undeployedCapital(context);
    // Half the allocation on entry, keeping the rest as dry powder for dips -
    // a grid with nothing left to buy on a fall is just a long position.
    const opening = remaining / 2;
    if (!canAffordOrder(context, opening)) {
      if (!canAffordOrder(context, remaining)) {
        return {
          action: 'hold',
          reason: `Allocation is below the ${context.rules.pair} minimum order size.`,
        };
      }
      return {
        action: 'buy',
        quoteAmount: remaining,
        reason: 'Opening the grid with the full allocation; too small to split.',
      };
    }
    return {
      action: 'buy',
      quoteAmount: opening,
      reason: 'Opening the grid at half allocation, holding the rest for lower levels.',
    };
  }

  const entry = position.averageEntryPrice;
  const upper = entry * (1 + band);
  const lower = entry * (1 - band);

  if (price >= upper) {
    // Take a third off the table rather than closing out: a grid earns by
    // selling into strength repeatedly, not once.
    const quantity = held / 3;
    return {
      action: 'sell',
      quantity,
      reason: `Price ${price.toFixed(2)} is ${(band * 100).toFixed(1)}% above average entry; taking a third off.`,
    };
  }

  if (price <= lower) {
    const remaining = undeployedCapital(context);
    const slice = Math.min(remaining, state.allocatedCapital / 4);
    if (!canAffordOrder(context, slice)) {
      return {
        action: 'hold',
        reason: 'Price is at a lower grid level but there is no capital left to add.',
      };
    }
    return {
      action: 'buy',
      quoteAmount: slice,
      reason: `Price ${price.toFixed(2)} is ${(band * 100).toFixed(1)}% below average entry; adding at a lower level.`,
    };
  }

  return {
    action: 'hold',
    reason: `Price ${price.toFixed(2)} is inside the grid band ${lower.toFixed(2)}-${upper.toFixed(2)}.`,
  };
}

/**
 * Decide what a flow does now.
 *
 * Arbitrage returns `unsupported` rather than approximating something. It
 * means simultaneously buying on one venue and selling on another, and the
 * platform has exactly one venue - there is no honest single-venue version of
 * it. A flow of this type does nothing and says why, which is better than
 * quietly running a different strategy under the name the trader chose.
 */
export function decide(context: StrategyContext): Intent {
  switch (context.state.kind) {
    case 'DCA':
      return decideDca(context);
    case 'Trailing Stop':
      return decideTrailingStop(context);
    case 'Grid':
      return decideGrid(context);
    case 'Arbitrage':
      return {
        action: 'unsupported',
        reason:
          'Arbitrage needs two venues to trade between, and only one is connected. This flow will not place orders.',
      };
    default:
      return {
        action: 'unsupported',
        reason: `Unknown strategy type "${context.state.kind}".`,
      };
  }
}
