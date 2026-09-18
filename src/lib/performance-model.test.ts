import { describe, expect, it } from 'vitest';
import {
  SETTLEMENT_INTERVAL_MS,
  modelledOutcomeIsProfit,
  modelledPnlAt,
  modelledPnlSeries,
} from './performance-model';

const HOUR = 3_600_000;
const INTERVAL_MS = SETTLEMENT_INTERVAL_MS;
const START = Date.UTC(2026, 0, 1);

/*
 * Mirrors GAIN_MIN / GAIN_MAX / LOSS_MIN / LOSS_MAX in performance-model.ts.
 * Those are not exported, so the bounds are restated here by hand - which is
 * the point: a test that imported them would still pass if the gain and loss
 * ranges were swapped in the model.
 *
 * They are quoted per six hours, exactly as the model quotes them, and scaled
 * by the same ratio, so shortening the settlement interval does not require
 * touching these literals.
 */
const MAGNITUDE_SCALE = SETTLEMENT_INTERVAL_MS / (6 * HOUR);
const GAIN_MIN = 0.005175 * MAGNITUDE_SCALE;
const GAIN_MAX = 0.018769 * MAGNITUDE_SCALE;
const LOSS_MIN = 0.003863 * MAGNITUDE_SCALE;
const LOSS_MAX = 0.003863 * MAGNITUDE_SCALE;

describe('deterministic performance model', () => {
  it('has exactly thirteen gains in each twenty-outcome cycle', () => {
    for (const first of [0, 20, 40]) {
      const gains = Array.from({ length: 20 }, (_, i) =>
        modelledOutcomeIsProfit('flow-a', first + i)
      ).filter(Boolean).length;
      expect(gains).toBe(13);
    }
  });

  it('is deterministic, flow-specific, capital-aware, and zero before creation', () => {
    const input = {
      flowId: 'flow-a',
      allocatedCapital: 1000,
      createdAt: START,
      at: START + 48 * HOUR,
    };
    // Two independently-built input objects (not the same reference) must
    // still agree, and the result must match a value pinned ahead of time -
    // a stub that ignores its input and returns a constant would fail this,
    // unlike a bare `f(x) === f(x)` check.
    const first = {
      flowId: 'flow-a',
      allocatedCapital: 1000,
      createdAt: new Date(START),
      at: START + 48 * HOUR,
    };
    const second = {
      flowId: 'flow-a',
      allocatedCapital: 1000,
      createdAt: new Date(START),
      at: START + 48 * HOUR,
    };
    expect(first).not.toBe(second);
    expect(modelledPnlAt(first)).toBe(modelledPnlAt(second));
    // The exact figure the current magnitudes produce for this flow at this
    // instant. It moves whenever those are retuned, and pinning it is the
    // point: a change to the model should have to be stated, not slip past.
    expect(modelledPnlAt(input)).toBeCloseTo(51.26617146405191, 9);
    expect(modelledPnlAt({ ...input, flowId: 'flow-b' })).not.toBe(modelledPnlAt(input));
    expect(modelledPnlAt({ ...input, allocatedCapital: 0 })).toBe(0);
    expect(modelledPnlAt({ ...input, at: START - HOUR })).toBe(0);
  });

  it('returns cumulative values with gains and losses and a matching final value', () => {
    const sampleTimes = Array.from({ length: 21 }, (_, i) => START + i * INTERVAL_MS);
    const input = { flowId: 'flow-a', allocatedCapital: 1000, createdAt: START, sampleTimes };
    const series = modelledPnlSeries(input);
    const deltas = series.slice(1).map((value, i) => value - series[i]);
    expect(series[0]).toBe(0);
    expect(deltas.some((value) => value > 0)).toBe(true);
    expect(deltas.some((value) => value < 0)).toBe(true);
    expect(series.at(-1)).toBe(modelledPnlAt({ ...input, at: sampleTimes.at(-1)! }));
  });

  it('aggregates the same as the sum of flow current values', () => {
    const sampleTimes = [START, START + 6 * HOUR, START + 12 * HOUR];
    const flows = [
      { flowId: 'flow-a', allocatedCapital: 1000, createdAt: START },
      { flowId: 'flow-b', allocatedCapital: 500, createdAt: START + 3 * HOUR },
    ];
    const total = flows.reduce(
      (sum, flow) => sum + modelledPnlAt({ ...flow, at: sampleTimes.at(-1)! }),
      0
    );
    const fromSeries = flows.reduce(
      (sum, flow) => sum + modelledPnlSeries({ ...flow, sampleTimes }).at(-1)!,
      0
    );
    expect(fromSeries).toBe(total);
  });

  it('keeps samples before a later-created flow at zero', () => {
    const sampleTimes = [START, START + INTERVAL_MS, START + 2 * INTERVAL_MS];
    const series = modelledPnlSeries({
      flowId: 'late-flow',
      allocatedCapital: 500,
      // After every sample above, so all three are genuinely pre-creation.
      createdAt: START + 3 * INTERVAL_MS,
      sampleTimes,
    });
    expect(series).toEqual([0, 0, 0]);
  });

  it('matches the chart final sample at the summary sampling instant', () => {
    const at = START + 30 * HOUR;
    const flow = { flowId: 'flow-a', allocatedCapital: 1000, createdAt: START };
    const chart = modelledPnlSeries({ ...flow, sampleTimes: [START, at] });
    expect(modelledPnlAt({ ...flow, at })).toBe(chart.at(-1));
  });

  it('scales P&L exactly with allocated capital for the same flow and time', () => {
    const base = { flowId: 'flow-capital', createdAt: START, at: START + 48 * HOUR };
    const at1000 = modelledPnlAt({ ...base, allocatedCapital: 1000 });
    const at2000 = modelledPnlAt({ ...base, allocatedCapital: 2000 });
    const at3000 = modelledPnlAt({ ...base, allocatedCapital: 3000 });
    expect(at1000).not.toBe(0);
    expect(at2000).toBeCloseTo(at1000 * 2, 9);
    expect(at3000).toBeCloseTo(at1000 * 3, 9);
  });

  it('keeps cumulative P&L within [-capital, capital] once drift has had long enough to reach it', () => {
    const flowId = 'flow-clamp';
    const allocatedCapital = 1000;
    // Net drift is ~+0.032% of capital per day whatever the settlement
    // interval is - magnitudes scale with it - so reaching the 100% bound
    // takes ~8.5 years. Twenty years leaves the clamp clear headroom to
    // engage well before the end of the run.
    //
    // Deliberately not trimmed to save time. The headroom is the point of the
    // test: a horizon that merely grazed the bound could pass without the
    // clamp ever engaging. At a five-minute interval that horizon is ~2.1M
    // outcomes, which is why this one carries an explicit timeout.
    const years = 20;
    const totalMs = years * 365 * 24 * HOUR;
    const sampleCount = 400;
    const sampleTimes = Array.from(
      { length: sampleCount },
      (_, i) => START + Math.round((i / (sampleCount - 1)) * totalMs)
    );
    const series = modelledPnlSeries({ flowId, allocatedCapital, createdAt: START, sampleTimes });

    for (const value of series) {
      expect(value).toBeLessThanOrEqual(allocatedCapital);
      expect(value).toBeGreaterThanOrEqual(-allocatedCapital);
    }
    // Confirm the clamp actually engaged (rather than the horizon simply
    // falling short of it): the unclamped drift over this horizon is well
    // over 100%, so the series must have touched the upper bound.
    expect(Math.max(...series)).toBe(allocatedCapital);
    // ~6s of genuine work; the 5s default is not a meaningful bound here.
  }, 30_000);

  it('maps a shuffled sampleTimes array to the same values as the sorted array', () => {
    const flowId = 'flow-order';
    const allocatedCapital = 1000;
    const sortedTimes = Array.from({ length: 21 }, (_, i) => START + i * INTERVAL_MS);

    // Deterministic shuffle: swap adjacent pairs, then reverse. No Math.random.
    const shuffled = [...sortedTimes];
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      [shuffled[i], shuffled[i + 1]] = [shuffled[i + 1], shuffled[i]];
    }
    shuffled.reverse();
    expect(shuffled).not.toEqual(sortedTimes);

    const sortedSeries = modelledPnlSeries({
      flowId,
      allocatedCapital,
      createdAt: START,
      sampleTimes: sortedTimes,
    });
    const expectedByTime = new Map(sortedTimes.map((time, i) => [time, sortedSeries[i]]));

    const shuffledSeries = modelledPnlSeries({
      flowId,
      allocatedCapital,
      createdAt: START,
      sampleTimes: shuffled,
    });
    shuffled.forEach((time, i) => {
      expect(shuffledSeries[i]).toBe(expectedByTime.get(time));
    });
  });

  it('gives duplicate sample timestamps identical values', () => {
    const flowId = 'flow-dup';
    const allocatedCapital = 1000;
    const t = START + 6 * INTERVAL_MS;
    const series = modelledPnlSeries({
      flowId,
      allocatedCapital,
      createdAt: START,
      sampleTimes: [t, START, t, t],
    });
    expect(series[0]).toBe(series[2]);
    expect(series[0]).toBe(series[3]);
    expect(series[0]).toBe(modelledPnlAt({ flowId, allocatedCapital, createdAt: START, at: t }));
  });

  it('trends net-positive over a long window given the specified gain/loss ranges', () => {
    const flowId = 'flow-drift';
    const allocatedCapital = 1000;
    const totalMs = 365 * 24 * HOUR; // ~73 cycles: enough for the edge to show, short of the clamp
    const series = modelledPnlSeries({
      flowId,
      allocatedCapital,
      createdAt: START,
      sampleTimes: [START, START + totalMs],
    });
    expect(series[1]).toBeGreaterThan(0);
  });

  it('sizes every single-outcome step within its declared gain or loss range', () => {
    const flowId = 'flow-magnitude';
    const allocatedCapital = 1000;
    const outcomeCount = 100;
    const sampleTimes = Array.from({ length: outcomeCount + 1 }, (_, i) => START + i * INTERVAL_MS);
    const series = modelledPnlSeries({ flowId, allocatedCapital, createdAt: START, sampleTimes });

    for (let i = 0; i < outcomeCount; i++) {
      const fraction = (series[i + 1] - series[i]) / allocatedCapital;
      if (modelledOutcomeIsProfit(flowId, i)) {
        expect(fraction).toBeGreaterThanOrEqual(GAIN_MIN - 1e-9);
        expect(fraction).toBeLessThanOrEqual(GAIN_MAX + 1e-9);
      } else {
        expect(fraction).toBeLessThanOrEqual(-LOSS_MIN + 1e-9);
        expect(fraction).toBeGreaterThanOrEqual(-LOSS_MAX - 1e-9);
      }
    }
  });

  it('returns zero P&L for non-finite or negative allocated capital', () => {
    const base = {
      flowId: 'flow-reject-capital',
      createdAt: START,
      sampleTimes: [START, START + 6 * HOUR],
    };
    expect(modelledPnlSeries({ ...base, allocatedCapital: NaN })).toEqual([0, 0]);
    expect(modelledPnlSeries({ ...base, allocatedCapital: Infinity })).toEqual([0, 0]);
    expect(modelledPnlSeries({ ...base, allocatedCapital: -Infinity })).toEqual([0, 0]);
    expect(modelledPnlSeries({ ...base, allocatedCapital: -100 })).toEqual([0, 0]);
    expect(modelledPnlSeries({ ...base, allocatedCapital: 0 })).toEqual([0, 0]);
  });

  it('returns zero P&L for an unparseable, null, or undefined createdAt', () => {
    const base = {
      flowId: 'flow-reject-created',
      allocatedCapital: 1000,
      sampleTimes: [START, START + 6 * HOUR],
    };
    expect(modelledPnlSeries({ ...base, createdAt: 'not-a-date' })).toEqual([0, 0]);
    expect(modelledPnlSeries({ ...base, createdAt: null })).toEqual([0, 0]);
    expect(modelledPnlSeries({ ...base, createdAt: undefined })).toEqual([0, 0]);
  });
});
