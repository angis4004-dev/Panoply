import { describe, it, expect } from 'vitest';
import { HALTED_BY_DEFAULT, type RiskLimits } from '@/lib/models/TradingControl';
import { checkRisk, type RiskContext } from './risk';

/*
 * Each of these is a loss the platform can suffer without anything throwing an
 * error. A strategy that is simply wrong loses money correctly; only a ceiling
 * stops it.
 */

const NOW = new Date('2026-06-01T12:00:00Z');

const LIMITS: RiskLimits = {
  tradingHalted: false,
  haltedReason: '',
  maxOrderNotionalMinor: 100_000, // $1,000
  maxBotPositionMinor: 500_000, // $5,000
  maxUserExposureMinor: 2_000_000, // $20,000
  maxDailyLossMinor: 100_000, // $1,000
  minSecondsBetweenOrders: 60,
};

const BUY: RiskContext = {
  orderNotional: 100,
  currentBotPositionValue: 0,
  currentUserExposure: 0,
  realizedLossTodayMinor: 0,
  lastOrderAt: null,
  now: NOW,
  side: 'buy',
};

const secondsAgo = (n: number) => new Date(NOW.getTime() - n * 1000);

describe('the kill switch', () => {
  it('allows an ordinary order when not halted', () => {
    expect(checkRisk(LIMITS, BUY).allowed).toBe(true);
  });

  it('blocks everything when halted, and gives the operator reason', () => {
    const halted = { ...LIMITS, tradingHalted: true, haltedReason: 'Investigating a bad fill.' };
    const decision = checkRisk(halted, BUY);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('Investigating a bad fill.');
    // Transient: the operator will lift it, and callers should retry later
    // rather than mark the flow permanently broken.
    expect(decision.transient).toBe(true);
  });

  it('blocks sells too - a halt means stop, not stop buying', () => {
    const halted = { ...LIMITS, tradingHalted: true };
    expect(checkRisk(halted, { ...BUY, side: 'sell' }).allowed).toBe(false);
  });

  /*
   * A missing controls document, or a database read that failed, must not be
   * permission to trade.
   */
  it('refuses under the halted-by-default limits', () => {
    expect(checkRisk(HALTED_BY_DEFAULT, BUY).allowed).toBe(false);
  });
});

describe('order size', () => {
  it('refuses an order over the single-order ceiling, naming both figures', () => {
    const decision = checkRisk(LIMITS, { ...BUY, orderNotional: 1500 });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/\$1500\.00/);
    expect(decision.reason).toMatch(/\$1000\.00/);
  });

  it('allows an order exactly on the ceiling', () => {
    expect(checkRisk(LIMITS, { ...BUY, orderNotional: 1000 }).allowed).toBe(true);
  });

  it('refuses a nonsense notional rather than passing NaN downstream', () => {
    expect(checkRisk(LIMITS, { ...BUY, orderNotional: 0 }).allowed).toBe(false);
    expect(checkRisk(LIMITS, { ...BUY, orderNotional: -100 }).allowed).toBe(false);
    expect(checkRisk(LIMITS, { ...BUY, orderNotional: Number.NaN }).allowed).toBe(false);
  });
});

describe('exposure ceilings', () => {
  it('refuses a buy that would take the flow over its position limit', () => {
    const decision = checkRisk(LIMITS, {
      ...BUY,
      orderNotional: 600,
      currentBotPositionValue: 4600,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/position limit/i);
  });

  it('refuses a buy that would take the trader over their exposure limit', () => {
    const decision = checkRisk(LIMITS, {
      ...BUY,
      orderNotional: 600,
      currentUserExposure: 19_600,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/exposure limit/i);
  });

  it('allows a buy that lands exactly on a limit', () => {
    expect(
      checkRisk(LIMITS, { ...BUY, orderNotional: 400, currentBotPositionValue: 4600 }).allowed
    ).toBe(true);
  });

  /*
   * The most important asymmetry in this file. A position over its ceiling -
   * because the ceiling was lowered, or the market moved - must still be
   * closable. Blocking the sell would trap the flow in exactly the position
   * the limit says is too large.
   */
  it('never blocks a sell on an exposure limit, even far over it', () => {
    const wayOver = {
      ...BUY,
      side: 'sell' as const,
      orderNotional: 900,
      currentBotPositionValue: 50_000,
      currentUserExposure: 500_000,
    };
    expect(checkRisk(LIMITS, wayOver).allowed).toBe(true);
  });
});

describe('the daily loss backstop', () => {
  it('stops new buys once the platform hits its daily loss limit', () => {
    const decision = checkRisk(LIMITS, { ...BUY, realizedLossTodayMinor: 100_000 });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/daily loss limit/i);
    expect(decision.transient).toBe(true);
  });

  it('allows buys below the limit', () => {
    expect(checkRisk(LIMITS, { ...BUY, realizedLossTodayMinor: 99_999 }).allowed).toBe(true);
  });

  /*
   * Closing positions is the most likely thing an operator wants to do at the
   * moment this trips.
   */
  it('still allows sells after the limit is hit', () => {
    expect(
      checkRisk(LIMITS, { ...BUY, side: 'sell', realizedLossTodayMinor: 500_000 }).allowed
    ).toBe(true);
  });
});

describe('the rate limit', () => {
  it('refuses an order too soon after the last one, saying how long to wait', () => {
    const decision = checkRisk(LIMITS, { ...BUY, lastOrderAt: secondsAgo(10) });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/50s to wait/);
    expect(decision.transient).toBe(true);
  });

  it('allows an order once the interval has passed', () => {
    expect(checkRisk(LIMITS, { ...BUY, lastOrderAt: secondsAgo(61) }).allowed).toBe(true);
  });

  it('allows the first ever order on a flow', () => {
    expect(checkRisk(LIMITS, { ...BUY, lastOrderAt: null }).allowed).toBe(true);
  });

  /*
   * Applies to both sides. A loop placing sells costs the same in fees as one
   * placing buys, and a strategy oscillating between them is the worst case.
   */
  it('rate-limits sells as well as buys', () => {
    expect(checkRisk(LIMITS, { ...BUY, side: 'sell', lastOrderAt: secondsAgo(10) }).allowed).toBe(
      false
    );
  });
});

describe('limits set to zero mean unlimited', () => {
  const unlimited: RiskLimits = {
    tradingHalted: false,
    haltedReason: '',
    maxOrderNotionalMinor: 0,
    maxBotPositionMinor: 0,
    maxUserExposureMinor: 0,
    maxDailyLossMinor: 0,
    minSecondsBetweenOrders: 0,
  };

  it('applies no ceiling when a limit is zero', () => {
    const huge = {
      ...BUY,
      orderNotional: 1_000_000,
      currentBotPositionValue: 1_000_000,
      currentUserExposure: 9_000_000,
      realizedLossTodayMinor: 9_000_000,
      lastOrderAt: secondsAgo(0),
    };
    expect(checkRisk(unlimited, huge).allowed).toBe(true);
  });

  it('but the halt still overrides everything', () => {
    expect(checkRisk({ ...unlimited, tradingHalted: true }, BUY).allowed).toBe(false);
  });
});

describe('refusal ordering', () => {
  /*
   * The first reason reported should be the most fundamental one. An operator
   * reading "too soon since the last order" while trading is halted would
   * chase the wrong thing.
   */
  it('reports the halt ahead of every other breach', () => {
    const everythingWrong: RiskContext = {
      orderNotional: 999_999,
      currentBotPositionValue: 999_999,
      currentUserExposure: 999_999,
      realizedLossTodayMinor: 999_999,
      lastOrderAt: secondsAgo(1),
      now: NOW,
      side: 'buy',
    };
    const decision = checkRisk(
      { ...LIMITS, tradingHalted: true, haltedReason: 'Halted.' },
      everythingWrong
    );
    expect(decision.reason).toBe('Halted.');
  });
});
