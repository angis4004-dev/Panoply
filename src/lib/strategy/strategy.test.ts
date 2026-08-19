import { describe, it, expect } from 'vitest';
import { positionFromFills, FLAT, type PositionState } from '@/lib/exchange/position';
import type { SymbolRules, Ticker } from '@/lib/exchange/types';
import { decide, type StrategyContext, type StrategyKind, type StrategyState } from './index';

/*
 * These decide what happens to a trader's money, so the cases below are the
 * ones a trader would ask about: when does it buy, when does it sell, and what
 * stops it doing something silly.
 */

const RULES: SymbolRules = {
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

const NOW = new Date('2026-06-01T12:00:00Z');
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

function ticker(price: number): Ticker {
  return { pair: 'ETH/USDT', price, bid: price - 0.5, ask: price + 0.5, at: NOW };
}

function context(
  kind: StrategyKind,
  overrides: {
    position?: PositionState;
    price?: number;
    state?: Partial<StrategyState>;
  } = {}
): StrategyContext {
  return {
    state: {
      kind,
      pair: 'ETH/USDT',
      confidence: 50,
      allocatedCapital: 1000,
      lastOrderAt: null,
      peakPrice: null,
      startedAt: hoursAgo(48),
      ...overrides.state,
    },
    position: overrides.position ?? FLAT,
    ticker: ticker(overrides.price ?? 2000),
    rules: RULES,
    now: NOW,
  };
}

const buy = (quantity: number, price: number) => ({
  side: 'buy' as const,
  quantity,
  price,
  fee: 0,
});

describe('DCA', () => {
  it('buys a slice when the interval has elapsed', () => {
    const intent = decide(context('DCA'));
    expect(intent.action).toBe('buy');
    if (intent.action !== 'buy') return;
    // 50 confidence -> 5.5% of a 1000 allocation.
    expect(intent.quoteAmount).toBeCloseTo(55, 6);
    expect(intent.reason).toMatch(/scheduled/i);
  });

  it('holds until the interval has elapsed', () => {
    const intent = decide(context('DCA', { state: { lastOrderAt: hoursAgo(3) } }));
    expect(intent.action).toBe('hold');
    expect(intent.reason).toMatch(/next scheduled buy in/i);
  });

  it('deploys faster at higher confidence, but still in slices', () => {
    const low = decide(context('DCA', { state: { confidence: 0 } }));
    const high = decide(context('DCA', { state: { confidence: 100 } }));
    if (low.action !== 'buy' || high.action !== 'buy') throw new Error('expected buys');

    expect(high.quoteAmount).toBeGreaterThan(low.quoteAmount);
    // Even at full conviction it must not become a lump sum, or it is not DCA.
    expect(high.quoteAmount).toBeLessThan(1000 * 0.2);
  });

  it('holds once the allocation is fully deployed', () => {
    const position = positionFromFills([buy(0.5, 2000)]); // cost basis 1000
    const intent = decide(context('DCA', { position }));
    expect(intent.action).toBe('hold');
    expect(intent.reason).toMatch(/fully deployed/i);
  });

  /*
   * Without this a flow finishes with a few dollars that can never meet the
   * venue minimum, and retries forever.
   */
  it('spends the remainder rather than leaving an untradeable stub', () => {
    // 0.4925 * 2000 = 985 deployed, 15 left - under one 5.5% slice but over
    // the 10 minNotional.
    const position = positionFromFills([buy(0.4925, 2000)]);
    const intent = decide(context('DCA', { position }));
    expect(intent.action).toBe('buy');
    if (intent.action !== 'buy') return;
    expect(intent.quoteAmount).toBeCloseTo(15, 6);
    expect(intent.reason).toMatch(/final/i);
  });

  it('holds when the stub is below the venue minimum', () => {
    const position = positionFromFills([buy(0.4975, 2000)]); // 5 left, under 10
    const intent = decide(context('DCA', { position }));
    expect(intent.action).toBe('hold');
    expect(intent.reason).toMatch(/minimum order size/i);
  });

  /*
   * DCA is an accumulation plan. A DCA bot that sold on its own would be a
   * different strategy wearing the name.
   */
  it('never sells, however far price moves', () => {
    const position = positionFromFills([buy(0.5, 2000)]);
    for (const price of [100, 1000, 4000, 100_000]) {
      expect(decide(context('DCA', { position, price })).action).not.toBe('sell');
    }
  });
});

describe('Trailing Stop', () => {
  it('opens the position when flat', () => {
    const intent = decide(context('Trailing Stop'));
    expect(intent.action).toBe('buy');
    if (intent.action !== 'buy') return;
    expect(intent.quoteAmount).toBe(1000);
    expect(intent.reason).toMatch(/opening/i);
  });

  it('holds while price stays above the stop', () => {
    const position = positionFromFills([buy(0.5, 2000)]);
    const intent = decide(
      context('Trailing Stop', { position, price: 2100, state: { peakPrice: 2100 } })
    );
    expect(intent.action).toBe('hold');
    expect(intent.reason).toMatch(/above the trailing stop/i);
  });

  it('sells the whole position once price falls through the stop', () => {
    // 50 confidence -> 8.5% stop. Peak 2400 -> trigger 2196.
    const position = positionFromFills([buy(0.5, 2000)]);
    const intent = decide(
      context('Trailing Stop', { position, price: 2100, state: { peakPrice: 2400 } })
    );
    expect(intent.action).toBe('sell');
    if (intent.action !== 'sell') return;
    expect(intent.quantity).toBe(0.5);
    expect(intent.reason).toMatch(/fell/i);
  });

  it('trails from the peak, not from the entry', () => {
    // Price is well above entry but far below peak - it must still sell.
    const position = positionFromFills([buy(0.5, 1000)]);
    const intent = decide(
      context('Trailing Stop', { position, price: 2000, state: { peakPrice: 3000 } })
    );
    expect(intent.action).toBe('sell');
  });

  it('gives a high-conviction flow more room before stopping out', () => {
    const position = positionFromFills([buy(0.5, 2000)]);
    // 10% below a 2400 peak: inside a 12% stop, outside a 5% one.
    const at = { position, price: 2160, state: { peakPrice: 2400 } };

    expect(
      decide(context('Trailing Stop', { ...at, state: { ...at.state, confidence: 100 } })).action
    ).toBe('hold');
    expect(
      decide(context('Trailing Stop', { ...at, state: { ...at.state, confidence: 0 } })).action
    ).toBe('sell');
  });

  it('falls back to the entry price when no peak has been recorded', () => {
    const position = positionFromFills([buy(0.5, 2000)]);
    // 20% below entry, with no peak stored. Must still trigger.
    const intent = decide(context('Trailing Stop', { position, price: 1600 }));
    expect(intent.action).toBe('sell');
  });
});

describe('Grid', () => {
  it('opens at half allocation, keeping powder for lower levels', () => {
    const intent = decide(context('Grid'));
    expect(intent.action).toBe('buy');
    if (intent.action !== 'buy') return;
    expect(intent.quoteAmount).toBe(500);
    expect(intent.reason).toMatch(/half allocation/i);
  });

  it('holds inside the band', () => {
    const position = positionFromFills([buy(0.25, 2000)]);
    const intent = decide(context('Grid', { position, price: 2010 }));
    expect(intent.action).toBe('hold');
    expect(intent.reason).toMatch(/inside the grid band/i);
  });

  it('takes a third off above the band', () => {
    // 50 confidence -> 5% band. Entry 2000 -> upper 2100.
    const position = positionFromFills([buy(0.3, 2000)]);
    const intent = decide(context('Grid', { position, price: 2150 }));
    expect(intent.action).toBe('sell');
    if (intent.action !== 'sell') return;
    expect(intent.quantity).toBeCloseTo(0.1, 6);
  });

  it('adds below the band while capital remains', () => {
    const position = positionFromFills([buy(0.25, 2000)]); // 500 deployed
    const intent = decide(context('Grid', { position, price: 1850 }));
    expect(intent.action).toBe('buy');
    if (intent.action !== 'buy') return;
    expect(intent.quoteAmount).toBe(250);
    expect(intent.reason).toMatch(/lower level/i);
  });

  it('holds below the band when there is nothing left to add', () => {
    const position = positionFromFills([buy(0.5, 2000)]); // fully deployed
    const intent = decide(context('Grid', { position, price: 1850 }));
    expect(intent.action).toBe('hold');
    expect(intent.reason).toMatch(/no capital left/i);
  });
});

describe('Arbitrage', () => {
  /*
   * Arbitrage means buying on one venue and selling on another. There is one
   * venue. Quietly running a different strategy under the name the trader
   * chose would be worse than doing nothing.
   */
  it('refuses to run against a single venue, and says why', () => {
    const intent = decide(context('Arbitrage'));
    expect(intent.action).toBe('unsupported');
    expect(intent.reason).toMatch(/two venues/i);
  });

  it('stays unsupported whatever the position or price', () => {
    const position = positionFromFills([buy(0.5, 2000)]);
    expect(decide(context('Arbitrage', { position, price: 9000 })).action).toBe('unsupported');
  });
});

describe('every strategy', () => {
  const kinds: StrategyKind[] = ['DCA', 'Trailing Stop', 'Grid', 'Arbitrage'];

  it('always gives a reason', () => {
    for (const kind of kinds) {
      expect(decide(context(kind)).reason.length).toBeGreaterThan(10);
    }
  });

  it('never proposes a buy below the venue minimum notional', () => {
    for (const kind of kinds) {
      const intent = decide(context(kind, { state: { allocatedCapital: 5 } }));
      if (intent.action === 'buy') {
        expect(intent.quoteAmount).toBeGreaterThanOrEqual(RULES.minNotional);
      }
    }
  });

  it('never proposes selling more than is held', () => {
    const position = positionFromFills([buy(0.5, 2000)]);
    for (const kind of kinds) {
      for (const price of [500, 1500, 2000, 2500, 10_000]) {
        const intent = decide(context(kind, { position, price, state: { peakPrice: 5000 } }));
        if (intent.action === 'sell') {
          expect(intent.quantity).toBeLessThanOrEqual(position.quantity);
        }
      }
    }
  });

  it('never proposes spending more than the allocation', () => {
    for (const kind of kinds) {
      const intent = decide(context(kind));
      if (intent.action === 'buy') {
        expect(intent.quoteAmount).toBeLessThanOrEqual(1000);
      }
    }
  });

  it('rejects an unknown strategy type rather than silently holding', () => {
    const intent = decide(context('Momentum' as StrategyKind));
    expect(intent.action).toBe('unsupported');
  });
});
