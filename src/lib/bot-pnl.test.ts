import { describe, it, expect } from 'vitest';
import {
  applyPendingTicks,
  formatPnl,
  pnlPercentSeries,
  TICK_INTERVAL_MS,
  type ProjectableBot,
} from './bot-pnl';

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

function runFor(ms: number, confidence = 80, startPercent = 0, id = 'flow-a') {
  const now = new Date();
  return applyPendingTicks(
    {
      id,
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
function hourlySeries(hours: number, confidence = 80, id = 'flow-a') {
  const alignedNow = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const series: number[] = [];
  let percent = 0;
  for (let h = hours; h > 0; h--) {
    const result = applyPendingTicks(
      {
        id,
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
        id: 'flow-a',
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
      { id: 'flow-a', status: 'running', confidence: 70, simulatedPnlPercent: 0, lastTickAt },
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
    // Each sample uses a different flow id: jitter is seeded now, so repeating
    // with the same id would just re-measure one identical run 40 times.
    const samples = Array.from({ length: 40 }, (_, i) => {
      const series = hourlySeries(24 * 7, 90, `flow-${i}`);
      return series[series.length - 1];
    });
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

    expect(mean).toBeGreaterThan(0);
    expect(mean).toBeLessThan(40);
  });

  it('rewards higher confidence without letting it dominate the market', () => {
    const mean = (confidence: number) => {
      const runs = Array.from({ length: 40 }, (_, i) => {
        const series = hourlySeries(24 * 7, confidence, `flow-${i}`);
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

  it('holds the 70/30 split within every individual day', () => {
    // The quota exists because independent per-hour draws only average 70%:
    // across 24 draws the daily share swung from ~51% to ~89%, so a measured
    // day read 83% up while the week around it read 65%. Every day must now
    // land on exactly 17 up hours and 7 down.
    //
    // Started on an exact epoch-day boundary. A series stepped from an
    // arbitrary hour has every 24-hour slice straddling two days, which
    // measures the wrong window rather than a wrong engine.
    const days = 21;
    const endHour = Math.floor(Date.now() / HOUR_MS);
    const startHour = Math.floor((endHour - days * 24) / 24) * 24;

    const series: number[] = [];
    let percent = 0;
    for (let h = 0; h < days * 24; h++) {
      const from = (startHour + h) * HOUR_MS;
      percent = applyPendingTicks(
        {
          id: 'flow-a',
          status: 'running',
          confidence: 80,
          simulatedPnlPercent: percent,
          lastTickAt: new Date(from),
        },
        new Date(from + HOUR_MS)
      ).simulatedPnlPercent;
      series.push(percent);
    }

    for (let day = 0; day < days; day++) {
      let down = 0;
      for (let h = 0; h < 24; h++) {
        const i = day * 24 + h;
        const prior = i === 0 ? 0 : series[i - 1];
        if (series[i] < prior) down += 1;
      }
      expect(down).toBe(7);
    }
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

/**
 * The chart complaint these cover: selecting "1 day" produced an axis running
 * 3:37am to 7:03am, because the series came from snapshots written only while
 * a dashboard was open. The window has to be the one that was asked for, and
 * every point in it has to carry a real value.
 */
describe('historical reconstruction', () => {
  const bot = (over: Partial<ProjectableBot> = {}): ProjectableBot => ({
    id: 'flow-a',
    status: 'running',
    confidence: 80,
    simulatedPnlPercent: 3,
    lastTickAt: new Date(),
    createdAt: new Date(Date.now() - 30 * 24 * HOUR_MS),
    ...over,
  });

  const dayOfSamples = (points = 145) => {
    const now = Date.now();
    const from = now - 24 * HOUR_MS;
    const step = (now - from) / (points - 1);
    return Array.from({ length: points }, (_, i) => Math.round(from + i * step));
  };

  it('returns a value for every requested moment across a full day', () => {
    const times = dayOfSamples();
    const series = pnlPercentSeries(bot(), times);

    expect(series).toHaveLength(times.length);
    expect(series.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('ends on the flow’s stored value, so the chart agrees with the dashboard', () => {
    const now = new Date();
    const series = pnlPercentSeries(bot({ lastTickAt: now, simulatedPnlPercent: 7.5 }), [
      now.getTime(),
    ]);
    expect(series[0]).toBeCloseTo(7.5, 6);
  });

  it('is reproducible - the same moment always reads the same', () => {
    const times = dayOfSamples();
    const a = pnlPercentSeries(bot(), times);
    const b = pnlPercentSeries(bot(), times);
    expect(a).toEqual(b);
  });

  it('moves across the day rather than tracing one flat line', () => {
    const series = pnlPercentSeries(bot(), dayOfSamples());
    const distinct = new Set(series.map((v) => v.toFixed(6)));
    // The old chart drew two endpoints joined by a straight line; anything
    // resembling that fails here.
    expect(distinct.size).toBeGreaterThan(50);
  });

  it('shows both gains and losses within a single day', () => {
    const series = pnlPercentSeries(bot(), dayOfSamples());
    const ups = series.filter((v, i) => i > 0 && v > series[i - 1]).length;
    const downs = series.filter((v, i) => i > 0 && v < series[i - 1]).length;
    expect(ups).toBeGreaterThan(0);
    expect(downs).toBeGreaterThan(0);
  });

  it('reports nothing before the flow existed', () => {
    const createdAt = new Date(Date.now() - 2 * HOUR_MS);
    const series = pnlPercentSeries(bot({ createdAt }), [
      createdAt.getTime() - HOUR_MS,
      createdAt.getTime() + HOUR_MS,
    ]);
    expect(series[0]).toBe(0);
    expect(series[1]).not.toBe(0);
  });

  it('holds a paused flow flat after its anchor instead of earning while off', () => {
    const pausedAt = new Date(Date.now() - 6 * HOUR_MS);
    const series = pnlPercentSeries(
      bot({ status: 'paused', lastTickAt: pausedAt, simulatedPnlPercent: 4 }),
      [pausedAt.getTime() + HOUR_MS, pausedAt.getTime() + 5 * HOUR_MS, Date.now()]
    );
    expect(series[0]).toBeCloseTo(4, 6);
    expect(series[1]).toBeCloseTo(4, 6);
    expect(series[2]).toBeCloseTo(4, 6);
  });
});

describe('formatPnl', () => {
  it('always carries an explicit sign', () => {
    expect(formatPnl(4.24)).toBe('+4.2%');
    expect(formatPnl(-0.62)).toBe('-0.6%');
    expect(formatPnl(0)).toBe('+0.0%');
  });
});
