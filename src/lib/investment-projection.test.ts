import { describe, it, expect } from 'vitest';
import {
  projectInvestment,
  targetBand,
  TARGET_RETURN,
  SCENARIO_LEVERAGE,
  MIN_TARGET_RETURN,
  MAX_TARGET_RETURN,
  PROJECTION_DAYS,
} from './investment-projection';

const base = { initialPrice: 60000, instrument: 'BTC/USDT' } as const;

describe('the modelled range', () => {
  it('is 30% conservative, 40% moderate, 65% aggressive', () => {
    expect(TARGET_RETURN.conservative).toBe(0.3);
    expect(TARGET_RETURN.moderate).toBe(0.4);
    expect(TARGET_RETURN.aggressive).toBe(0.65);
  });

  it('never models a target outside the band, whatever it is handed', () => {
    const low = projectInvestment({
      ...base,
      capital: 1000,
      riskProfile: 'moderate',
      targetReturn: 0.05,
    });
    const high = projectInvestment({
      ...base,
      capital: 1000,
      riskProfile: 'moderate',
      targetReturn: 4,
    });
    expect(low?.targetReturn).toBe(MIN_TARGET_RETURN);
    expect(high?.targetReturn).toBe(MAX_TARGET_RETURN);
  });

  it('projects over the lock period', () => {
    expect(PROJECTION_DAYS).toBe(14);
  });
});

describe('the pricing function produces the PnL', () => {
  /*
   * The point of the exercise. If PnL were capital x target this test would
   * still pass, so it is computed here the long way - position size times the
   * price move - and compared against what the engine returned.
   */
  it('PnL equals position size times the price move', () => {
    const p = projectInvestment({ ...base, capital: 2500, riskProfile: 'aggressive' })!;
    const byHand = p.positionSize * (p.projectedPrice - p.initialPrice);
    expect(p.projectedPnl).toBeCloseTo(byHand, 9);
    expect(p.projectedPositionValue - p.initialPositionValue).toBeCloseTo(p.projectedPnl, 9);
  });

  it('sizes the position as capital x leverage, priced in the underlying', () => {
    const p = projectInvestment({ ...base, capital: 1000, riskProfile: 'moderate' })!;
    expect(p.positionSize).toBeCloseTo((1000 * SCENARIO_LEVERAGE.moderate) / 60000, 12);
    expect(p.initialPositionValue).toBeCloseTo(1000 * SCENARIO_LEVERAGE.moderate, 9);
  });

  /*
   * 40% on 4x needs a 10% move, not a 40% one. Showing the move is what lets
   * someone judge whether the scenario is plausible.
   */
  it('solves for the price move the target implies', () => {
    const p = projectInvestment({ ...base, capital: 1000, riskProfile: 'moderate' })!;
    expect(p.requiredPriceMovePct).toBeCloseTo(10, 9);
    expect(p.projectedPrice).toBeCloseTo(66000, 6);

    const aggressive = projectInvestment({ ...base, capital: 1000, riskProfile: 'aggressive' })!;
    expect(aggressive.requiredPriceMovePct).toBeCloseTo(13, 9);
  });

  it('is unchanged by the price it starts from', () => {
    const cheap = projectInvestment({
      ...base,
      initialPrice: 0.42,
      capital: 1000,
      riskProfile: 'moderate',
    })!;
    const dear = projectInvestment({
      ...base,
      initialPrice: 98000,
      capital: 1000,
      riskProfile: 'moderate',
    })!;
    expect(cheap.projectedPnl).toBeCloseTo(dear.projectedPnl, 9);
  });

  it('gives the same answer every time it is asked', () => {
    const once = projectInvestment({ ...base, capital: 1234.56, riskProfile: 'conservative' });
    const twice = projectInvestment({ ...base, capital: 1234.56, riskProfile: 'conservative' });
    expect(once).toEqual(twice);
  });
});

describe('the validation examples', () => {
  const cases: Array<[number, number, number]> = [
    [100, 30, 40],
    [500, 150, 200],
    [1000, 300, 400],
    [5000, 1500, 2000],
    [10000, 3000, 4000],
  ];

  it.each(cases)('$%d models %d conservative and %d moderate', (capital, at30, at40) => {
    const conservative = projectInvestment({ ...base, capital, riskProfile: 'conservative' })!;
    const moderate = projectInvestment({ ...base, capital, riskProfile: 'moderate' })!;

    expect(conservative.projectedPnl).toBeCloseTo(at30, 6);
    expect(conservative.projectedPortfolioValue).toBeCloseTo(capital + at30, 6);
    expect(moderate.projectedPnl).toBeCloseTo(at40, 6);
    expect(moderate.projectedPortfolioValue).toBeCloseTo(capital + at40, 6);
  });

  it('reports the gain percentage the profile targets', () => {
    expect(
      projectInvestment({ ...base, capital: 1000, riskProfile: 'conservative' })!.projectedGainPct
    ).toBeCloseTo(30, 9);
    expect(
      projectInvestment({ ...base, capital: 1000, riskProfile: 'moderate' })!.projectedGainPct
    ).toBeCloseTo(40, 9);
    expect(
      projectInvestment({ ...base, capital: 1000, riskProfile: 'aggressive' })!.projectedGainPct
    ).toBeCloseTo(65, 9);
  });

  it('bands a capital between the lowest and highest modelled target', () => {
    expect(targetBand(1000)).toEqual({ min: 300, max: 650 });
  });
});

describe('input that cannot be priced', () => {
  it('returns null rather than a zero projection', () => {
    expect(projectInvestment({ ...base, capital: 0, riskProfile: 'moderate' })).toBeNull();
    expect(projectInvestment({ ...base, capital: -5, riskProfile: 'moderate' })).toBeNull();
    expect(
      projectInvestment({ ...base, initialPrice: 0, capital: 100, riskProfile: 'moderate' })
    ).toBeNull();
    expect(
      projectInvestment({
        ...base,
        initialPrice: Number.NaN,
        capital: 100,
        riskProfile: 'moderate',
      })
    ).toBeNull();
  });
});
