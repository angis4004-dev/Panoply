import { describe, expect, it } from 'vitest';
import { modelledOutcomeIsProfit, modelledPnlAt, modelledPnlSeries } from './performance-model';

const HOUR = 3_600_000;
const START = Date.UTC(2026, 0, 1);

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
    expect(modelledPnlAt(input)).toBe(modelledPnlAt(input));
    expect(modelledPnlAt({ ...input, flowId: 'flow-b' })).not.toBe(modelledPnlAt(input));
    expect(modelledPnlAt({ ...input, allocatedCapital: 0 })).toBe(0);
    expect(modelledPnlAt({ ...input, at: START - HOUR })).toBe(0);
  });

  it('returns cumulative values with gains and losses and a matching final value', () => {
    const sampleTimes = Array.from({ length: 21 }, (_, i) => START + i * 6 * HOUR);
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
    const sampleTimes = [START, START + 6 * HOUR, START + 12 * HOUR];
    const series = modelledPnlSeries({
      flowId: 'late-flow',
      allocatedCapital: 500,
      createdAt: START + 9 * HOUR,
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
});
