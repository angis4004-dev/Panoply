import { describe, expect, it } from 'vitest';
import { marketPnlSeries, type MarketPricePoint } from './market-pnl-model';

const START = Date.UTC(2026, 0, 1);
const POINT = 5 * 60 * 1000;

function prices(baseUsdValues: number[], quoteUsd = 1): MarketPricePoint[] {
  return baseUsdValues.map((baseUsd, index) => ({
    timestamp: START + index * POINT,
    baseUsd,
    quoteUsd,
  }));
}

describe('market P&L model', () => {
  it('marks DCA positions against market prices and charges fill fees', () => {
    const flat = marketPnlSeries({
      strategy: 'DCA',
      allocatedCapital: 3000,
      prices: prices([100, 100]),
    });
    const rising = marketPnlSeries({
      strategy: 'DCA',
      allocatedCapital: 3000,
      prices: prices([100, 110]),
    });

    expect(flat?.[0]).toBeCloseTo(-0.1, 6);
    expect(rising?.[1]).toBeGreaterThan(flat?.[1] ?? 0);
  });

  it('buys and sells grid levels instead of generating fixed interval outcomes', () => {
    const series = marketPnlSeries({
      strategy: 'Grid',
      allocatedCapital: 1000,
      prices: prices([100, 98, 100, 102, 100]),
    });

    expect(series).not.toBeNull();
    expect(series?.[1]).toBeLessThan(0);
    expect(series?.[2]).not.toBe(series?.[1]);
    expect(series?.[3]).not.toBe(series?.[2]);
  });

  it('exits after the trailing stop and re-enters after a recovery', () => {
    const series = marketPnlSeries({
      strategy: 'Trailing Stop',
      allocatedCapital: 1000,
      prices: prices([100, 110, 107.8, 105, 108, 110]),
    });

    expect(series).not.toBeNull();
    expect(series?.[2]).toBeLessThan(series?.[1] ?? 0);
    expect(series?.[5]).toBeGreaterThan(series?.[4] ?? 0);
  });

  it('requires cross-market pricing for arbitrage rather than inventing P&L', () => {
    expect(
      marketPnlSeries({ strategy: 'Arbitrage', allocatedCapital: 1000, prices: prices([100, 110]) })
    ).toBeNull();
  });

  it('values quote-asset cash in USD when both pair assets move together', () => {
    const series = marketPnlSeries({
      strategy: 'DCA',
      allocatedCapital: 3000,
      prices: [
        { timestamp: START, baseUsd: 100, quoteUsd: 10 },
        { timestamp: START + POINT, baseUsd: 110, quoteUsd: 11 },
      ],
    });

    expect(series?.[1]).toBeCloseTo(299.89, 6);
  });
});
