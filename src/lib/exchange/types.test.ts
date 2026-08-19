import { describe, it, expect } from 'vitest';
import {
  checkOrderAgainstRules,
  decimalsForStep,
  fromMinorUnits,
  quantityForQuote,
  roundDownToStep,
  roundPriceToTick,
  splitPair,
  toMinorUnits,
  toVenueSymbol,
  type SymbolRules,
} from './types';

/*
 * Venue rules are the cause of most first-time order rejections, and the
 * venue's error messages are unhelpful. These tests pin the arithmetic that
 * turns a rejection into a number adjusted before it leaves the process.
 */

const ETHUSDT: SymbolRules = {
  pair: 'ETH/USDT',
  venueSymbol: 'ETHUSDT',
  baseAsset: 'ETH',
  quoteAsset: 'USDT',
  lotStep: 0.0001,
  minQuantity: 0.0001,
  maxQuantity: 9000,
  tickSize: 0.01,
  minNotional: 10,
};

describe('splitPair', () => {
  it('splits a well-formed pair', () => {
    expect(splitPair('ETH/USDT')).toEqual({ base: 'ETH', quote: 'USDT' });
  });

  it('uppercases and trims', () => {
    expect(splitPair('  eth/usdt ')).toEqual({ base: 'ETH', quote: 'USDT' });
  });

  /*
   * These arrive from user-created bots, so a bad one must be a validation
   * message rather than a 500.
   */
  it('returns null for anything malformed', () => {
    expect(splitPair('ETHUSDT')).toBeNull();
    expect(splitPair('ETH/')).toBeNull();
    expect(splitPair('/USDT')).toBeNull();
    expect(splitPair('ETH/USDT/BTC')).toBeNull();
    expect(splitPair('')).toBeNull();
    expect(splitPair('ET H/USDT')).toBeNull();
    expect(splitPair('E/USDT')).toBeNull();
  });
});

describe('toVenueSymbol', () => {
  it('concatenates base and quote', () => {
    expect(toVenueSymbol('ETH/USDT')).toBe('ETHUSDT');
    expect(toVenueSymbol('btc/usdt')).toBe('BTCUSDT');
  });

  it('returns null for a malformed pair', () => {
    expect(toVenueSymbol('nonsense')).toBeNull();
  });
});

describe('decimalsForStep', () => {
  /*
   * Derived from the string form, not a logarithm. log10(0.001) is
   * -2.9999999999999996 in float64, which Math.round hides only until a step
   * where it does not.
   */
  it('reads the decimals off the step', () => {
    expect(decimalsForStep(1)).toBe(0);
    expect(decimalsForStep(0.1)).toBe(1);
    expect(decimalsForStep(0.001)).toBe(3);
    expect(decimalsForStep(0.00000001)).toBe(8);
  });

  it('handles a step that is not a power of ten', () => {
    expect(decimalsForStep(0.05)).toBe(2);
    expect(decimalsForStep(0.25)).toBe(2);
  });

  it('is zero for a nonsense step rather than NaN', () => {
    expect(decimalsForStep(0)).toBe(0);
    expect(decimalsForStep(-1)).toBe(0);
    expect(decimalsForStep(Number.NaN)).toBe(0);
  });
});

describe('roundDownToStep', () => {
  it('rounds down to the step', () => {
    expect(roundDownToStep(1.23456, 0.001)).toBe(1.234);
    expect(roundDownToStep(1.9999, 1)).toBe(1);
  });

  /*
   * Down, never nearest. Rounding a sell quantity up is an order for more than
   * is held; rounding a buy up spends more than was allocated.
   */
  it('never rounds up, even at nine-tenths of a step', () => {
    expect(roundDownToStep(1.0009, 0.001)).toBe(1);
    expect(roundDownToStep(0.99999, 1)).toBe(0);
  });

  /*
   * The float trap this function exists for. A bare
   * Math.floor(value / step) * step gives 0.28 here, losing a whole step,
   * because 0.29 / 0.01 is 28.999999999999996.
   */
  it('does not lose a step to float division error', () => {
    expect(roundDownToStep(0.29, 0.01)).toBe(0.29);
    expect(roundDownToStep(0.07, 0.01)).toBe(0.07);
    expect(roundDownToStep(1.1, 0.1)).toBe(1.1);
    expect(roundDownToStep(4.35, 0.05)).toBe(4.35);
  });

  it('leaves a value already on the grid alone', () => {
    expect(roundDownToStep(2.5, 0.5)).toBe(2.5);
    expect(roundDownToStep(100, 0.0001)).toBe(100);
  });

  it('is zero for a value smaller than one step', () => {
    expect(roundDownToStep(0.0005, 0.001)).toBe(0);
  });

  it('is zero for nonsense input rather than NaN', () => {
    expect(roundDownToStep(Number.NaN, 0.01)).toBe(0);
    expect(roundDownToStep(1, 0)).toBe(0);
    expect(roundDownToStep(1, -0.1)).toBe(0);
  });

  it('handles eight-decimal precision, which BTC quantities need', () => {
    expect(roundDownToStep(0.123456789, 0.00000001)).toBe(0.12345678);
  });
});

describe('roundPriceToTick', () => {
  it('snaps a price to the tick grid', () => {
    expect(roundPriceToTick(2000.567, 0.01)).toBe(2000.56);
    expect(roundPriceToTick(2000.567, 0.1)).toBe(2000.5);
    expect(roundPriceToTick(2000.567, 1)).toBe(2000);
  });
});

describe('checkOrderAgainstRules', () => {
  it('accepts an order that satisfies every rule', () => {
    expect(checkOrderAgainstRules(ETHUSDT, 0.01, 2000)).toBeNull();
  });

  it('refuses a non-positive quantity or price', () => {
    expect(checkOrderAgainstRules(ETHUSDT, 0, 2000)).toMatch(/quantity must be greater than zero/i);
    expect(checkOrderAgainstRules(ETHUSDT, -1, 2000)).toMatch(/quantity/i);
    expect(checkOrderAgainstRules(ETHUSDT, 0.01, 0)).toMatch(/price must be greater than zero/i);
    expect(checkOrderAgainstRules(ETHUSDT, 0.01, Number.NaN)).toMatch(/price/i);
  });

  it('refuses a quantity outside the venue bounds, naming the limit', () => {
    expect(checkOrderAgainstRules(ETHUSDT, 0.00001, 2000)).toMatch(/minimum of 0.0001/);
    expect(checkOrderAgainstRules(ETHUSDT, 10000, 2000)).toMatch(/maximum of 9000/);
  });

  /*
   * The rule that stops a small allocation dead, and the one worth the
   * clearest message: the fix is "allocate more", not "retry".
   */
  it('refuses an order under the minimum notional, in quote currency', () => {
    const complaint = checkOrderAgainstRules(ETHUSDT, 0.001, 2000);
    expect(complaint).toMatch(/2\.00 USDT is below/);
    expect(complaint).toMatch(/minimum of 10/);
  });

  it('accepts an order exactly on the notional minimum', () => {
    expect(checkOrderAgainstRules(ETHUSDT, 0.005, 2000)).toBeNull();
  });
});

describe('quantityForQuote', () => {
  it('converts an allocation into a lot-aligned quantity', () => {
    expect(quantityForQuote(1000, 2000, ETHUSDT)).toBe(0.5);
  });

  it('rounds down so the order never costs more than the allocation', () => {
    // 100 / 3333 = 0.030003..., which must not become 0.0301.
    const quantity = quantityForQuote(100, 3333, ETHUSDT);
    expect(quantity).toBe(0.03);
    expect(quantity * 3333).toBeLessThanOrEqual(100);
  });

  /*
   * The caller must read this as "this bot cannot trade", not as an error to
   * retry - no amount of retrying makes the allocation bigger.
   */
  it('is zero when the allocation cannot buy a single lot', () => {
    expect(quantityForQuote(0.01, 2000, ETHUSDT)).toBe(0);
  });

  it('is zero for nonsense input', () => {
    expect(quantityForQuote(0, 2000, ETHUSDT)).toBe(0);
    expect(quantityForQuote(-100, 2000, ETHUSDT)).toBe(0);
    expect(quantityForQuote(1000, 0, ETHUSDT)).toBe(0);
    expect(quantityForQuote(1000, Number.NaN, ETHUSDT)).toBe(0);
  });
});

describe('minor units', () => {
  /*
   * Rounds to nearest, not down. This is a settlement figure, and
   * systematically rounding realized profit down would skim a fraction of a
   * cent off every close.
   */
  it('rounds to the nearest cent', () => {
    expect(toMinorUnits(10.005)).toBe(1001);
    expect(toMinorUnits(10.004)).toBe(1000);
  });

  /*
   * Math.round breaks ties toward +Infinity, so a true -1000.5 would round to
   * -1000 and a loss would be a cent kinder than the matching gain. It does
   * not arise here: 10.005 * 100 is 1000.5000000000001 in float64, just past
   * the tie, so both signs round away from zero and the treatment is
   * symmetric. Asserted because it is luck rather than design, and a change to
   * the conversion could quietly reintroduce the asymmetry.
   */
  it('treats an equal gain and loss symmetrically', () => {
    expect(toMinorUnits(-10.005)).toBe(-1001);
    expect(toMinorUnits(-10.005)).toBe(-toMinorUnits(10.005));
  });

  it('round-trips a clean amount', () => {
    expect(fromMinorUnits(toMinorUnits(1234.56))).toBeCloseTo(1234.56, 10);
  });

  it('is zero for nonsense rather than NaN reaching the ledger', () => {
    expect(toMinorUnits(Number.NaN)).toBe(0);
    expect(toMinorUnits(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('handles the float representation of a plain price', () => {
    // 19.99 * 100 is 1998.9999999999998 before rounding.
    expect(toMinorUnits(19.99)).toBe(1999);
    expect(toMinorUnits(0.29)).toBe(29);
  });
});
