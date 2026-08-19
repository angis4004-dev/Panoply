import { describe, it, expect } from 'vitest';
import {
  DEMO_EPOCH,
  demoFlowPnl,
  demoPnlSeries,
  demoWinRate,
  flowStartMs,
  isDemoMode,
} from './demo-mode';

/*
 * Demo mode invents numbers, so the thing worth testing is that it cannot be
 * switched on by accident and that the curve it draws is the one asked for.
 */

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1);

/** One sample per day across `days`. */
function daily(days: number): number[] {
  return Array.from({ length: days }, (_, i) => START + i * DAY);
}

describe('the switch', () => {
  it('is off when unset', () => {
    expect(isDemoMode({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  /*
   * The string "false" is truthy in JavaScript. A demo that turns itself on
   * because someone wrote DEMO_MODE=false would put generated profit figures
   * in front of depositors.
   */
  it('stays off for anything that is not an explicit yes', () => {
    for (const value of ['false', 'no', '0', 'off', '', ' ', 'maybe']) {
      expect(isDemoMode({ DEMO_MODE: value } as unknown as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  it('turns on for true, 1 and yes, in any case', () => {
    for (const value of ['true', 'TRUE', '1', 'yes', ' True ']) {
      expect(isDemoMode({ DEMO_MODE: value } as unknown as NodeJS.ProcessEnv)).toBe(true);
    }
  });
});

describe('the win rate', () => {
  it('defaults to 70/30', () => {
    expect(demoWinRate({} as unknown as NodeJS.ProcessEnv)).toBe(0.7);
  });

  it('falls back to the default for nonsense rather than throwing', () => {
    for (const value of ['abc', '-1', '2', '']) {
      expect(demoWinRate({ DEMO_WIN_RATE: value } as unknown as NodeJS.ProcessEnv)).toBe(0.7);
    }
  });

  it('accepts a rate in range', () => {
    expect(demoWinRate({ DEMO_WIN_RATE: '0.55' } as unknown as NodeJS.ProcessEnv)).toBe(0.55);
  });
});

describe('the generated curve', () => {
  const series = demoPnlSeries({
    seed: 'user-1',
    allocatedCapital: 5200,
    sampleTimes: daily(400),
    winRate: 0.7,
  });

  it('produces one value per sample', () => {
    expect(series).toHaveLength(400);
    expect(series.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('closes up on roughly 70% of days', () => {
    let up = 0;
    for (let i = 1; i < series.length; i++) {
      if (series[i] > series[i - 1]) up += 1;
    }
    const rate = up / (series.length - 1);
    expect(rate).toBeGreaterThan(0.6);
    expect(rate).toBeLessThan(0.8);
  });

  it('trends upward over a long window', () => {
    expect(series[series.length - 1]).toBeGreaterThan(series[0]);
  });

  /*
   * A 70% win rate alone would draw a near-straight ramp. Losing days are
   * sized close to winning ones - large enough that a bad run cuts a visible
   * dip into the line, while still leaving the net drift clearly positive.
   */
  it('has real drawdowns rather than a straight line up', () => {
    let peak = series[0];
    let worst = 0;
    for (const value of series) {
      peak = Math.max(peak, value);
      worst = Math.min(worst, value - peak);
    }
    expect(worst).toBeLessThan(0);
  });

  it('is stable across calls, so a refresh does not redraw history', () => {
    const again = demoPnlSeries({
      seed: 'user-1',
      allocatedCapital: 5200,
      sampleTimes: daily(400),
      winRate: 0.7,
    });
    expect(again).toEqual(series);
  });

  it('gives different accounts different curves', () => {
    const other = demoPnlSeries({
      seed: 'user-2',
      allocatedCapital: 5200,
      sampleTimes: daily(400),
      winRate: 0.7,
    });
    expect(other).not.toEqual(series);
  });

  it('scales with allocated capital', () => {
    const bigger = demoPnlSeries({
      seed: 'user-1',
      allocatedCapital: 52_000,
      sampleTimes: daily(400),
      winRate: 0.7,
    });
    expect(Math.abs(bigger[399])).toBeGreaterThan(Math.abs(series[399]) * 5);
  });

  it('returns a flat zero series when nothing is allocated', () => {
    const flat = demoPnlSeries({ seed: 'x', allocatedCapital: 0, sampleTimes: daily(10) });
    expect(flat.every((v) => v === 0)).toBe(true);
  });

  it('moves within a single day, so an intraday chart is not a step', () => {
    const intraday = demoPnlSeries({
      seed: 'user-1',
      allocatedCapital: 5200,
      sampleTimes: Array.from({ length: 24 }, (_, i) => START + i * 3_600_000),
    });
    expect(new Set(intraday).size).toBeGreaterThan(12);
  });
});

describe('per-flow figures', () => {
  const AT = START + 200 * DAY;

  it('is stable for a given flow', () => {
    expect(demoFlowPnl('flow-a', 1000, AT)).toBe(demoFlowPnl('flow-a', 1000, AT));
  });

  it('is zero for a flow with no capital', () => {
    expect(demoFlowPnl('flow-a', 0, AT)).toBe(0);
  });

  /*
   * The guarantee that keeps the dashboard honest with itself. The chart plots
   * the sum of the per-flow curves and the Realized P&L tile adds up the
   * per-flow figures; if these two ever came from different generators the
   * same screen would show two different totals.
   */
  it('sums to exactly what the portfolio chart plots at the same instant', () => {
    const flows = [
      { id: 'flow-a', allocated: 4000 },
      { id: 'flow-b', allocated: 800 },
      { id: 'flow-c', allocated: 400 },
    ];

    const tileTotal = flows.reduce((sum, f) => sum + demoFlowPnl(f.id, f.allocated, AT), 0);

    const chartTotal = flows.reduce(
      (sum, f) =>
        sum + demoPnlSeries({ seed: f.id, allocatedCapital: f.allocated, sampleTimes: [AT] })[0],
      0
    );

    expect(tileTotal).toBeCloseTo(chartTotal, 10);
  });

  it('gives different flows different figures', () => {
    expect(demoFlowPnl('flow-a', 1000, AT)).not.toBe(demoFlowPnl('flow-b', 1000, AT));
  });

  /*
   * Bounded per day, not in total.
   *
   * Cumulative return necessarily grows with the holding period, so a fixed
   * cap on the total is really a statement about how far this test happens to
   * wind the clock - it failed the moment the daily drift was corrected, while
   * saying nothing about whether the figures had become unbelievable. The rate
   * is the thing a reader would judge, and it holds at every horizon.
   */
  it('stays within a daily rate a person would believe', () => {
    const heldDays = (AT - DEMO_EPOCH) / DAY;
    for (let i = 0; i < 200; i++) {
      const percent = (demoFlowPnl(`flow-${i}`, 1000, AT) / 1000) * 100;
      expect(Math.abs(percent) / heldDays).toBeLessThan(1);
    }
  });
});

/*
 * A flow's profit begins when the flow does.
 *
 * Every flow used to accumulate from one shared epoch, so starting a flow
 * handed it every day since that date: a brand new $1,000 position opened at
 * +$242, up 24% before it had traded for a second. The figure is the whole
 * point of the demonstration, and that one was self-evidently invented.
 */
describe('a flow starts from zero', () => {
  const NOW = DEMO_EPOCH + 220 * DAY;
  const HOUR = 3_600_000;

  it('reports nothing at the instant it is created', () => {
    expect(demoFlowPnl('fresh', 1000, NOW, 0.7, NOW)).toBe(0);
  });

  it('reports nothing for any time before it existed', () => {
    const startedAt = NOW - 2 * HOUR;
    const before = [NOW - 30 * DAY, NOW - 7 * DAY, NOW - DAY, startedAt - 1];
    for (const ts of before) {
      expect(
        demoPnlSeries({ seed: 'fresh', allocatedCapital: 4000, sampleTimes: [ts], startedAt })[0]
      ).toBe(0);
    }
  });

  it('leaves the axis only once the flow has started', () => {
    const startedAt = NOW - 2 * HOUR;
    const sampleTimes = Array.from({ length: 9 }, (_, i) => NOW - 30 * DAY + i * ((30 * DAY) / 8));
    const series = demoPnlSeries({ seed: 'fresh', allocatedCapital: 4000, sampleTimes, startedAt });

    // Everything but the final point predates the flow.
    expect(series.slice(0, -1).every((v) => v === 0)).toBe(true);
    expect(series[series.length - 1]).not.toBe(0);
  });

  /*
   * The regression that prompted all of this. A flow minutes old must show
   * minutes of profit, not eight months of it.
   */
  it('does not back-date profit onto a flow created moments ago', () => {
    const fresh = demoFlowPnl('same-seed', 1000, NOW, 0.7, NOW - 5 * 60_000);
    const old = demoFlowPnl('same-seed', 1000, NOW, 0.7, DEMO_EPOCH);
    expect(Math.abs(fresh)).toBeLessThan(5);
    expect(Math.abs(old)).toBeGreaterThan(50);
  });

  it('grows as the flow ages', () => {
    const older = demoFlowPnl('grower', 1000, NOW, 0.7, NOW - 30 * DAY);
    const newer = demoFlowPnl('grower', 1000, NOW, 0.7, NOW - DAY);
    expect(older).toBeGreaterThan(newer);
  });

  it('moves within the first hour, so a new flow is visibly live', () => {
    const startedAt = NOW;
    const sampleTimes = Array.from({ length: 12 }, (_, i) => startedAt + i * 5 * 60_000);
    const series = demoPnlSeries({ seed: 'live', allocatedCapital: 4000, sampleTimes, startedAt });
    expect(series[0]).toBe(0);
    expect(new Set(series).size).toBeGreaterThan(8);
  });

  /*
   * The demonstration exists to show a strategy making money. A first day
   * drawn at 70/30 would open red for three flows in ten, which is the first
   * thing a client would see.
   */
  it('closes its opening day up, whatever the seed', () => {
    for (let i = 0; i < 100; i++) {
      const startedAt = DEMO_EPOCH + i * DAY;
      const atClose = startedAt + DAY - 1;
      expect(
        demoPnlSeries({
          seed: `opener-${i}`,
          allocatedCapital: 1000,
          sampleTimes: [atClose],
          startedAt,
        })[0]
      ).toBeGreaterThan(0);
    }
  });

  /*
   * Losing days used to be larger than winning ones, leaving a drift thinner
   * than a single day's noise: a fifth of all flows sat red after a month.
   */
  it('is reliably up over a month across many flows', () => {
    let red = 0;
    for (let i = 0; i < 200; i++) {
      if (demoFlowPnl(`month-${i}`, 1000, NOW, 0.7, NOW - 30 * DAY) < 0) red += 1;
    }
    expect(red / 200).toBeLessThan(0.05);
  });
});

describe('flowStartMs', () => {
  it('reads a Date and an ISO string alike', () => {
    const d = new Date(DEMO_EPOCH + 5 * DAY);
    expect(flowStartMs(d)).toBe(d.getTime());
    expect(flowStartMs(d.toISOString())).toBe(d.getTime());
  });

  /*
   * Falls back to the epoch rather than to "now": a flow whose age cannot be
   * read is treated as long-running, so an unparseable date cannot wipe out a
   * figure the trader has been watching.
   */
  it('falls back to the epoch for anything unusable', () => {
    for (const value of [null, undefined, '', 'not a date']) {
      expect(flowStartMs(value)).toBe(DEMO_EPOCH);
    }
  });
});
