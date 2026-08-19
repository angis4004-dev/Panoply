import { describe, it, expect } from 'vitest';
import { tradingControlSchema } from '@/lib/admin/validation';
import { summarize } from './scheduler';
import type { CycleResult } from './execution';

/*
 * The scheduler's own moving parts need a database, so what is covered here is
 * the part that decides what an operator is told happened - and the shape of
 * the change they are allowed to make.
 */

function result(overrides: Partial<CycleResult> = {}): CycleResult {
  return { botId: 'flow-1', action: 'hold', reason: 'Holding.', ...overrides };
}

describe('summarizing a cycle', () => {
  it('counts an empty run as nothing at all', () => {
    expect(summarize([])).toEqual({ placed: 0, held: 0, refused: 0, failed: 0 });
  });

  it('separates orders placed from flows that held', () => {
    const summary = summarize([result({ action: 'buy', orderId: 'o1' }), result(), result()]);
    expect(summary).toEqual({ placed: 1, held: 2, refused: 0, failed: 0 });
  });

  it('distinguishes a refusal from a failure', () => {
    // A risk ceiling doing its job is not the same event as a venue call
    // blowing up, and an operator scanning the log needs to tell them apart.
    const summary = summarize([
      result({ refusedBy: 'risk', reason: 'Over the daily loss limit.' }),
      result({ refusedBy: 'venue', reason: 'Below the minimum notional.' }),
      result({ refusedBy: 'error', reason: 'Connection reset.' }),
    ]);
    expect(summary).toEqual({ placed: 0, held: 0, refused: 2, failed: 1 });
  });

  /*
   * The one direction this count must never be wrong in. An order that reached
   * the venue is real money regardless of what the rest of the cycle reported,
   * and counting it as anything but placed would under-report real orders.
   */
  it('counts an order as placed even when the cycle also reported a problem', () => {
    const summary = summarize([result({ orderId: 'o1', refusedBy: 'error' })]);
    expect(summary).toEqual({ placed: 1, held: 0, refused: 0, failed: 0 });
  });

  it('treats an unsupported strategy as a hold, not a failure', () => {
    // Arbitrage declining to run against one venue is the designed outcome.
    // Counting it as failed would put a permanent red number on the console.
    const summary = summarize([result({ action: 'unsupported', reason: 'Needs two venues.' })]);
    expect(summary.failed).toBe(0);
    expect(summary.held).toBe(1);
  });
});

describe('the trading controls form', () => {
  const limits = {
    action: 'limits' as const,
    maxOrderNotionalMinor: 100_000,
    maxBotPositionMinor: 500_000,
    maxUserExposureMinor: 2_000_000,
    maxDailyLossMinor: 100_000,
    minSecondsBetweenOrders: 60,
  };

  it('accepts a well-formed set of limits', () => {
    expect(tradingControlSchema.safeParse(limits).success).toBe(true);
  });

  /*
   * Zero means "no ceiling" to checkRisk. It has to stay reachable through the
   * form, or removing a limit becomes a database job.
   */
  it('keeps zero reachable, because zero means unlimited', () => {
    const unlimited = {
      ...limits,
      maxOrderNotionalMinor: 0,
      maxDailyLossMinor: 0,
      minSecondsBetweenOrders: 0,
    };
    expect(tradingControlSchema.safeParse(unlimited).success).toBe(true);
  });

  it('refuses a negative ceiling', () => {
    expect(tradingControlSchema.safeParse({ ...limits, maxOrderNotionalMinor: -1 }).success).toBe(
      false
    );
  });

  it('refuses a fractional minor amount rather than rounding it', () => {
    expect(
      tradingControlSchema.safeParse({ ...limits, maxOrderNotionalMinor: 100.5 }).success
    ).toBe(false);
  });

  it('refuses an implausibly large ceiling, which is nearly always a typo', () => {
    expect(
      tradingControlSchema.safeParse({ ...limits, maxUserExposureMinor: 999_999_999_999 }).success
    ).toBe(false);
  });

  it('demands a reason before stopping or resuming trading', () => {
    expect(tradingControlSchema.safeParse({ action: 'halt' }).success).toBe(false);
    expect(tradingControlSchema.safeParse({ action: 'halt', reason: 'x' }).success).toBe(false);
    expect(
      tradingControlSchema.safeParse({ action: 'resume', reason: 'Venue recovered.' }).success
    ).toBe(true);
  });

  it('rejects an action it does not know', () => {
    expect(tradingControlSchema.safeParse({ action: 'disable-all-limits' }).success).toBe(false);
  });
});
