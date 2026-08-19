import { describe, it, expect } from 'vitest';
import {
  applyFill,
  formatPnlPercent,
  positionFromFills,
  quoteFeeFromFill,
  sellableQuantity,
  unrealizedPnl,
  valuePosition,
  FLAT,
  type PositionFill,
} from './position';

/*
 * The money the platform owes its users is computed by this module, so the
 * cases here are the ones that decide a payout: partial closes, re-entries,
 * fees, and the boundaries where a position opens and closes.
 */

const buy = (quantity: number, price: number, fee = 0): PositionFill => ({
  side: 'buy',
  quantity,
  price,
  fee,
});
const sell = (quantity: number, price: number, fee = 0): PositionFill => ({
  side: 'sell',
  quantity,
  price,
  fee,
});

/** Float comparison at cent precision - the resolution money is settled at. */
const closeTo = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 6);

describe('a single round trip', () => {
  it('opens a position at the fill price', () => {
    const state = positionFromFills([buy(2, 100)]);
    expect(state.quantity).toBe(2);
    closeTo(state.averageEntryPrice, 100);
    closeTo(state.costBasis, 200);
    closeTo(state.realizedPnl, 0);
  });

  it('books profit on a full close', () => {
    const state = positionFromFills([buy(2, 100), sell(2, 150)]);
    expect(state.quantity).toBe(0);
    closeTo(state.realizedPnl, 100); // 2 * (150 - 100)
  });

  it('books a loss on a full close', () => {
    const state = positionFromFills([buy(2, 100), sell(2, 80)]);
    closeTo(state.realizedPnl, -40);
  });

  it('resets the average entry when the position closes, so a re-entry starts clean', () => {
    const state = positionFromFills([buy(2, 100), sell(2, 150)]);
    expect(state.averageEntryPrice).toBe(0);
    expect(state.costBasis).toBe(0);

    const reentered = applyFill(state, buy(1, 200));
    closeTo(reentered.averageEntryPrice, 200);
    closeTo(reentered.realizedPnl, 100); // the earlier profit survives
  });
});

describe('weighted average entry', () => {
  it('re-weights across buys at different prices', () => {
    const state = positionFromFills([buy(1, 100), buy(1, 200)]);
    expect(state.quantity).toBe(2);
    closeTo(state.averageEntryPrice, 150);
  });

  it('weights by quantity, not by number of fills', () => {
    // 9 at 100 and 1 at 200 averages 110, not 150.
    const state = positionFromFills([buy(9, 100), buy(1, 200)]);
    closeTo(state.averageEntryPrice, 110);
  });

  /*
   * The property that distinguishes average cost from FIFO. A sell does not
   * change what the remaining units are deemed to have cost.
   */
  it('is unchanged by a partial sell', () => {
    const state = positionFromFills([buy(1, 100), buy(1, 200), sell(1, 500)]);
    expect(state.quantity).toBe(1);
    closeTo(state.averageEntryPrice, 150);
    closeTo(state.realizedPnl, 350); // 1 * (500 - 150)
  });
});

describe('partial closes', () => {
  it('realizes only the sold portion and leaves the rest open', () => {
    const state = positionFromFills([buy(10, 100), sell(4, 120)]);
    expect(state.quantity).toBe(6);
    closeTo(state.realizedPnl, 80); // 4 * (120 - 100)
    closeTo(state.costBasis, 600); // 6 still held at 100
  });

  it('sums realized P&L across several partial closes', () => {
    const state = positionFromFills([buy(10, 100), sell(3, 110), sell(3, 90), sell(4, 130)]);
    expect(state.quantity).toBe(0);
    // 3*10 + 3*(-10) + 4*30 = 120
    closeTo(state.realizedPnl, 120);
  });

  /*
   * Should not happen - orders are sized against the held quantity - but a
   * venue reporting fills out of order can produce it. Going negative would
   * silently model a short the platform has not taken.
   */
  it('clamps a sell larger than the position instead of going short', () => {
    const state = positionFromFills([buy(2, 100), sell(5, 150)]);
    expect(state.quantity).toBe(0);
    closeTo(state.realizedPnl, 100); // only the 2 actually held
  });

  it('does not go negative on a sell with no position at all', () => {
    const state = positionFromFills([sell(5, 150)]);
    expect(state.quantity).toBe(0);
    closeTo(state.realizedPnl, 0);
  });
});

describe('fees', () => {
  it('charges a buy fee to realized P&L immediately', () => {
    // The money left the account whether or not the position has closed.
    const state = positionFromFills([buy(1, 100, 0.5)]);
    closeTo(state.realizedPnl, -0.5);
    closeTo(state.totalFees, 0.5);
  });

  it('does not fold fees into the average entry price', () => {
    // Entry must match the venue's own statement, which is the first thing
    // anyone reconciles against.
    const state = positionFromFills([buy(1, 100, 5)]);
    closeTo(state.averageEntryPrice, 100);
  });

  it('nets both legs of fees out of a round trip', () => {
    const state = positionFromFills([buy(2, 100, 1), sell(2, 150, 1.5)]);
    closeTo(state.realizedPnl, 100 - 2.5);
    closeTo(state.totalFees, 2.5);
  });

  it('can turn a nominal gain into a real loss', () => {
    const state = positionFromFills([buy(1, 100, 1), sell(1, 100.5, 1)]);
    closeTo(state.realizedPnl, 0.5 - 2);
    expect(state.realizedPnl).toBeLessThan(0);
  });
});

describe('quoteFeeFromFill', () => {
  const fill = { feeAmount: 0.001, feeAsset: 'ETH', price: 2000 };

  it('passes a quote-asset fee through unchanged', () => {
    expect(quoteFeeFromFill({ feeAmount: 2.5, feeAsset: 'USDT', price: 2000 }, 'ETH', 'USDT')).toBe(
      2.5
    );
  });

  it('converts a base-asset fee at the fill price', () => {
    expect(quoteFeeFromFill(fill, 'ETH', 'USDT')).toBe(2);
  });

  it('is case-insensitive about asset names', () => {
    expect(quoteFeeFromFill({ feeAmount: 1, feeAsset: 'usdt', price: 100 }, 'ETH', 'USDT')).toBe(1);
  });

  it('treats a zero fee as zero without needing to know the asset', () => {
    expect(quoteFeeFromFill({ feeAmount: 0, feeAsset: 'BNB', price: 100 }, 'ETH', 'USDT')).toBe(0);
  });

  /*
   * Returning 0 for an unrecognised fee asset would understate costs on every
   * trade that used a discount token. Null forces the caller to deal with it.
   */
  it('returns null for a fee in an asset it cannot convert', () => {
    expect(quoteFeeFromFill({ feeAmount: 0.01, feeAsset: 'BNB', price: 2000 }, 'ETH', 'USDT')).toBe(
      null
    );
  });
});

describe('unrealized P&L', () => {
  const open = positionFromFills([buy(2, 100)]);

  it('marks an open position to the current price', () => {
    closeTo(unrealizedPnl(open, 150), 100);
    closeTo(unrealizedPnl(open, 50), -100);
  });

  it('is zero at the entry price', () => {
    closeTo(unrealizedPnl(open, 100), 0);
  });

  it('is zero when flat, whatever the price', () => {
    expect(unrealizedPnl(FLAT, 5000)).toBe(0);
    expect(unrealizedPnl(positionFromFills([buy(1, 100), sell(1, 200)]), 5000)).toBe(0);
  });

  it('is zero for an unusable mark price rather than NaN', () => {
    expect(unrealizedPnl(open, 0)).toBe(0);
    expect(unrealizedPnl(open, Number.NaN)).toBe(0);
  });
});

describe('valuePosition', () => {
  it('separates realized from unrealized and sums them', () => {
    // Bought 10 at 100, sold 4 at 120, holding 6, now marked at 130.
    const state = positionFromFills([buy(10, 100), sell(4, 120)]);
    const valuation = valuePosition(state, 130, 1000);

    closeTo(valuation.realizedPnl, 80);
    closeTo(valuation.unrealizedPnl, 180); // 6 * (130 - 100)
    closeTo(valuation.totalPnl, 260);
    closeTo(valuation.marketValue, 780);
    closeTo(valuation.pnlPercent!, 26);
  });

  /*
   * The denominator is allocated capital, not cost basis. A flow that deployed
   * a tenth of its allocation and doubled it has made 10% of what the user
   * committed, not 100%.
   */
  it('takes the percentage against allocated capital, not cost basis', () => {
    const state = positionFromFills([buy(1, 100)]);
    const valuation = valuePosition(state, 200, 1000);
    closeTo(valuation.unrealizedPnl, 100);
    closeTo(valuation.pnlPercent!, 10);
  });

  it('reports a null percentage when nothing was allocated', () => {
    // Distinct from 0.0%, which would read as "traded and went nowhere".
    expect(valuePosition(FLAT, 100, 0).pnlPercent).toBeNull();
    expect(valuePosition(FLAT, 100, Number.NaN).pnlPercent).toBeNull();
  });

  it('values a flat position at zero across the board', () => {
    const valuation = valuePosition(FLAT, 100, 1000);
    expect(valuation.totalPnl).toBe(0);
    expect(valuation.marketValue).toBe(0);
    expect(valuation.pnlPercent).toBe(0);
  });
});

describe('formatPnlPercent', () => {
  it('signs a gain and a loss', () => {
    expect(formatPnlPercent(4.23)).toBe('+4.2%');
    expect(formatPnlPercent(-0.64)).toBe('-0.6%');
  });

  it('renders an unfunded flow without a sign', () => {
    // '+0.0%' implies a gain of zero rather than an absence of one.
    expect(formatPnlPercent(null)).toBe('0.0%');
  });

  it('signs an exact zero as a gain, matching the existing dashboard', () => {
    expect(formatPnlPercent(0)).toBe('+0.0%');
  });
});

describe('rebuilding from history', () => {
  /*
   * The stored Position row is a materialized view of this computation. It is
   * recomputed rather than incremented so a missed or duplicated update cannot
   * accumulate into a wrong number - the same reason the ledger recomputes
   * balances in scripts/verify-ledger.mjs.
   */
  it('is deterministic - the same fills always give the same position', () => {
    const fills = [buy(3, 100, 0.3), buy(2, 110, 0.2), sell(4, 130, 0.5), buy(1, 90, 0.1)];
    expect(positionFromFills(fills)).toEqual(positionFromFills(fills));
  });

  it('counts every fill it folded in, for reconciliation against the venue', () => {
    const fills = [buy(1, 100), buy(1, 110), sell(2, 120)];
    expect(positionFromFills(fills).fillCount).toBe(3);
  });

  it('ignores a malformed fill rather than poisoning the position with NaN', () => {
    const state = positionFromFills([buy(1, 100), buy(Number.NaN, 100), buy(1, 0)]);
    expect(state.quantity).toBe(1);
    closeTo(state.averageEntryPrice, 100);
  });

  it('empty history is flat', () => {
    expect(positionFromFills([])).toEqual(FLAT);
  });
});

describe('sellableQuantity', () => {
  it('is the held quantity', () => {
    expect(sellableQuantity(positionFromFills([buy(5, 100)]))).toBe(5);
  });

  it('is zero when flat', () => {
    expect(sellableQuantity(FLAT)).toBe(0);
  });
});
