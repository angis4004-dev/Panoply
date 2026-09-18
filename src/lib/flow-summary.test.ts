import { describe, expect, it } from 'vitest';
import {
  DRAWDOWN_ALERT_PERCENT,
  parsePnlPercent,
  summarizeFlows,
  type FlowLike,
} from './flow-summary';

function flow(overrides: Partial<FlowLike>): FlowLike {
  return { pair: 'BTC/USDT', status: 'running', confidence: 70, pnl: '+0.0%', ...overrides };
}

// The example account the redesign was drawn with: four flows, three in profit,
// $3,000 deployed, $4,250 in the wallet.
const EXAMPLE: FlowLike[] = [
  flow({
    pair: 'BTC/USDT',
    allocatedAmount: 2000,
    confidence: 82,
    pnl: '+6.3%',
    realizedPnlDollar: 126,
    pnlDollarDayAgo: 110,
    pnlDollarWeekAgo: 0,
    marketValue: 2126,
  }),
  flow({
    pair: 'ETH/USDT',
    allocatedAmount: 500,
    confidence: 64,
    pnl: '+7.0%',
    realizedPnlDollar: 35,
    pnlDollarDayAgo: 30,
    pnlDollarWeekAgo: 0,
    marketValue: 535,
  }),
  flow({
    pair: 'SOL/USDT',
    allocatedAmount: 300,
    confidence: 88,
    pnl: '+7.3%',
    realizedPnlDollar: 22,
    pnlDollarDayAgo: 20,
    pnlDollarWeekAgo: 0,
    marketValue: 322,
  }),
  flow({
    pair: 'AVAX/USDT',
    status: 'paused',
    allocatedAmount: 200,
    confidence: 78,
    pnl: '-0.4%',
    realizedPnlDollar: -0.8,
    pnlDollarDayAgo: -0.8,
    pnlDollarWeekAgo: 0,
    marketValue: 199.2,
  }),
];

describe('parsePnlPercent', () => {
  it('reads signed percent strings', () => {
    expect(parsePnlPercent('+4.2%')).toBe(4.2);
    expect(parsePnlPercent('-0.6%')).toBe(-0.6);
  });

  it('reads garbage as zero rather than NaN', () => {
    expect(parsePnlPercent('n/a')).toBe(0);
  });
});

describe('summarizeFlows', () => {
  it('describes an account with no flows as zeros, not NaN', () => {
    const s = summarizeFlows([], 0);
    expect(s).toMatchObject({
      count: 0,
      totalAllocated: 0,
      totalPnlDollar: 0,
      pnlPercent: 0,
      pnlToday: 0,
      pnlWeek: 0,
      profitableRate: 0,
      avgConfidence: 0,
      largest: null,
      worst: null,
      drawdownPercent: 0,
      drawdownAlarmed: false,
      deployedShare: 0,
    });
  });

  it('totals the example account the way the cards show it', () => {
    const s = summarizeFlows(EXAMPLE, 4250);
    expect(s.count).toBe(4);
    expect(s.runningCount).toBe(3);
    expect(s.pausedCount).toBe(1);
    expect(s.totalAllocated).toBe(3000);
    expect(s.totalPnlDollar).toBeCloseTo(182.2, 6);
    expect(s.pnlPercent).toBeCloseTo((182.2 / 3000) * 100, 6);
    expect(s.profitable).toEqual([true, true, true, false]);
    expect(s.profitableCount).toBe(3);
    expect(s.profitableRate).toBe(75);
    expect(s.avgConfidence).toBe(78);
    expect(s.minConfidence).toBe(64);
    expect(s.maxConfidence).toBe(88);
  });

  it('measures deployed capital against allocated plus wallet', () => {
    // $3,000 / ($3,000 + $4,250) = 41.4%, the ring on the capital card.
    expect(summarizeFlows(EXAMPLE, 4250).deployedShare).toBeCloseTo(41.379, 3);
  });

  it('reports the largest flow and its share of what is deployed', () => {
    const { largest } = summarizeFlows(EXAMPLE, 4250);
    expect(largest).toMatchObject({
      pair: 'BTC/USDT',
      allocated: 2000,
      confidence: 82,
      hasPosition: true,
    });
    expect(largest?.shareOfDeployed).toBeCloseTo(66.667, 3);
  });

  it('keeps the first of two equally large flows, so the card does not flip between them', () => {
    const tied = [
      flow({ pair: 'A', allocatedAmount: 500 }),
      flow({ pair: 'B', allocatedAmount: 500 }),
    ];
    expect(summarizeFlows(tied, 0).largest?.pair).toBe('A');
  });

  it('does not claim a position for a flow that holds nothing', () => {
    const idle = [flow({ allocatedAmount: 1000, marketValue: 0 })];
    expect(summarizeFlows(idle, 0).largest?.hasPosition).toBe(false);
  });

  it('takes drawdown from the worst flow, and never reports a gain as one', () => {
    const s = summarizeFlows(EXAMPLE, 4250);
    expect(s.worst).toEqual({ pair: 'AVAX/USDT', drawdownPercent: 0.4 });
    expect(summarizeFlows([flow({ pnl: '+3.0%' })], 0).drawdownPercent).toBe(0);
  });

  it('raises the drawdown alarm at the threshold, not after it', () => {
    const at = summarizeFlows([flow({ pnl: `-${DRAWDOWN_ALERT_PERCENT}.0%` })], 0);
    const below = summarizeFlows([flow({ pnl: '-4.9%' })], 0);
    expect(at.drawdownAlarmed).toBe(true);
    expect(below.drawdownAlarmed).toBe(false);
  });

  it('sums the day and week deltas from the figures the API sent', () => {
    const s = summarizeFlows(EXAMPLE, 4250);
    // (126-110) + (35-30) + (22-20) + (-0.8 - -0.8)
    expect(s.pnlToday).toBeCloseTo(23, 6);
    expect(s.pnlWeek).toBeCloseTo(182.2, 6);
  });

  it('returns null for a period when any flow is missing its earlier figure', () => {
    const partial = [EXAMPLE[0], flow({ realizedPnlDollar: 10 })];
    const s = summarizeFlows(partial, 0);
    expect(s.pnlToday).toBeNull();
    expect(s.pnlWeek).toBeNull();
  });

  it('prefers the unrounded dollar figure, and falls back to the percent', () => {
    const rounded = [flow({ allocatedAmount: 1000, pnl: '+0.0%', realizedPnlDollar: 0.04 })];
    expect(summarizeFlows(rounded, 0).profitableCount).toBe(1);
    const legacy = [flow({ allocatedAmount: 1000, pnl: '+2.5%' })];
    expect(summarizeFlows(legacy, 0).totalPnlDollar).toBeCloseTo(25, 6);
  });
});
