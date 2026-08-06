import { describe, it, expect } from 'vitest';
import { applyPendingTicks, formatPnl, TICK_INTERVAL_MS } from './bot-pnl';

/**
 * The two bugs this file exists to catch, both of which shipped:
 *
 *   1. Per-tick drift 100x too large, compounding to roughly +320% per week.
 *   2. Flows that only ever gained, because the loss regime was absent.
 *
 * Both were arithmetic errors in a pure function, and both would have been
 * caught here in under a second.
 */

const HOUR_MS = 60 * 60 * 1000;

function runFor(ms: number, confidence = 80, startPercent = 0) {
  const now = new Date();
  return applyPendingTicks(
    {
      status: 'running',
      confidence,
      simulatedPnlPercent: startPercent,
      lastTickAt: new Date(now.getTime() - ms),
    },
    now
  );
}

/**
 * Hour-by-hour series, aligned to regime boundaries.
 *
 * The alignment matters and is easy to get wrong: regimes are keyed to the
 * absolute hour since the epoch, so a series stepped from an arbitrary "now"
 * has every bucket straddling two regimes. Measured that way the up-share
 * reads about 54% rather than 70% - not because the engine is wrong, but
 * because the window is not the one the engine defines. Flooring to an exact
 * epoch hour makes each step span exactly one regime.
 */
function hourlySeries(hours: number, confidence = 80) {
  const alignedNow = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const series: number[] = [];
  let percent = 0;
  for (let h = hours; h > 0; h--) {
    const result = applyPendingTicks(
      {
        status: 'running',
        confidence,
        simulatedPnlPercent: percent,
        lastTickAt: new Date(alignedNow - h * HOUR_MS),
      },
      new Date(alignedNow - (h - 1) * HOUR_MS)
    );
    percent = result.simulatedPnlPercent;
    series.push(percent);
  }
  return series;
}

describe('tick accounting', () => {
  it('accrues nothing for paused or fallback flows', () => {
    for (const status of ['paused', 'fallback'] as const) {
      const result = applyPendingTicks({
        status,
        confidence: 90,
        simulatedPnlPercent: 5,
        lastTickAt: new Date(Date.now() - 10 * HOUR_MS),
      });
      expect(result.ticksApplied).toBe(0);
      expect(result.simulatedPnlPercent).toBe(5);
    }
  });

  it('applies one tick per interval elapsed', () => {
    expect(runFor(TICK_INTERVAL_MS * 10).ticksApplied).toBe(10);
    // Partial intervals do not count, so the anchor never runs ahead of time.
    expect(runFor(TICK_INTERVAL_MS - 1).ticksApplied).toBe(0);
  });

  it('caps a single catch-up so one request cannot loop unbounded', () => {
    const week = runFor(7 * 24 * HOUR_MS);
    expect(week.ticksApplied).toBeLessThanOrEqual(2880);
  });

  it('advances the anchor by exactly the ticks applied', () => {
    const now = new Date();
    const lastTickAt = new Date(now.getTime() - 50 * TICK_INTERVAL_MS);
    const result = applyPendingTicks(
      { status: 'running', confidence: 70, simulatedPnlPercent: 0, lastTickAt },
      now
    );
    expect(result.lastTickAt.getTime()).toBe(
      lastTickAt.getTime() + result.ticksApplied * TICK_INTERVAL_MS
    );
  });
});

describe('drift magnitude', () => {
  it('stays in a believable range over a week', () => {
    // The regression guard. The shipped bug produced roughly +320%/week; any
    // return of that order fails here regardless of which constant caused it.
    const samples = Array.from({ length: 40 }, () => {
      const series = hourlySeries(24 * 7, 90);
      return series[series.length - 1];
    });
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(40);
  });

  it('rewards higher confidence without letting it dominate the market', () => {
    const mean = (confidence: number) => {
      const runs = Array.from({ length: 40 }, () => {
        const series = hourlySeries(24 * 7, confidence);
        return series[series.length - 1];
      });
      return runs.reduce((a, b) => a + b, 0) / runs.length;
    };
    expect(mean(95)).toBeGreaterThan(mean(20));
  });
});

describe('win/loss distribution', () => {
  it('produces roughly 70% up hours and 30% down', () => {
    const series = hourlySeries(4000, 80);
    let up = 0;
    for (let i = 1; i < series.length; i++) if (series[i] > series[i - 1]) up += 1;

    const upShare = up / (series.length - 1);
    expect(upShare).toBeGreaterThan(0.6);
    expect(upShare).toBeLessThan(0.8);
  });

  it('actually loses in losing hours', () => {
    // The second shipped bug: a flow that only ever went up. At least one hour
    // in a long run must move the balance backwards.
    const series = hourlySeries(500, 80);
    const declines = series.filter((v, i) => i > 0 && v < series[i - 1]);
    expect(declines.length).toBeGreaterThan(0);
  });

  it('draws down visibly rather than tracing a straight ramp', () => {
    const series = hourlySeries(1000, 80);
    let peak = series[0];
    let worstDrawdown = 0;
    for (const value of series) {
      peak = Math.max(peak, value);
      worstDrawdown = Math.max(worstDrawdown, peak - value);
    }
    expect(worstDrawdown).toBeGreaterThan(0.05);
  });
});

describe('formatPnl', () => {
  it('always carries an explicit sign', () => {
    expect(formatPnl(4.24)).toBe('+4.2%');
    expect(formatPnl(-0.62)).toBe('-0.6%');
    expect(formatPnl(0)).toBe('+0.0%');
  });
});
