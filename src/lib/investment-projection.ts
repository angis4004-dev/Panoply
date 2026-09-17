import type { RiskProfile } from '@/lib/types';
import { WITHDRAWAL_LOCK_DAYS } from '@/lib/withdrawal-rules';

/**
 * The scenario engine: what a position would be worth if the market moved the
 * way a chosen target implies.
 *
 * This is a projection, not a measurement. It answers "if this instrument
 * moved far enough to return X on your capital, what would that look like",
 * and every figure it returns is the arithmetic of that one assumption. It
 * never reports what a position has actually earned - realised performance
 * comes from src/lib/performance-model.ts and the ledger, and the two must
 * not be mixed in the interface.
 *
 * ## The pricing function
 *
 * A linear perpetual contract, the instrument Panoply's flows quote in, has
 * one pricing variable: the price of the underlying.
 *
 *   F(P; t) = Q x P            value of the position at price P
 *   dF      = Q x (P_t - P_0)  profit or loss over the period
 *
 * where Q is the position size in units of the underlying. Q is not free:
 * capital C at leverage L buys
 *
 *   Q = (C x L) / P_0
 *
 * ## Solving for the scenario
 *
 * The target return r is an input constraint, so the price that satisfies it
 * is solved for rather than guessed:
 *
 *   C x r = Q x (P_t - P_0)
 *         = (C x L / P_0) x (P_t - P_0)
 *   =>  P_t = P_0 x (1 + r / L)
 *
 * The underlying therefore has to move r/L for the position to return r. At
 * 40% on 4x, that is a 10% move in the price. Stating it this way is the
 * point of the exercise: the move is visible and can be judged, instead of a
 * profit figure appearing from nowhere.
 *
 * Everything here is pure arithmetic on the arguments - no clock, no market
 * feed, no randomness - so the same inputs always produce the same result.
 */

/**
 * The gain each risk profile is modelled against, as a fraction of capital,
 * over one lock period.
 *
 * These are scenario constraints chosen per profile, not expected returns and
 * not a promise. A higher figure means a more aggressive assumption about how
 * far the market moves, which is also a larger loss if it moves the other way.
 */
export const TARGET_RETURN: Record<RiskProfile, number> = {
  conservative: 0.3,
  moderate: 0.4,
  aggressive: 0.65,
};

/** The lowest and highest target the engine will model, whatever it is given. */
export const MIN_TARGET_RETURN = 0.3;
export const MAX_TARGET_RETURN = 0.65;

/**
 * Leverage assumed per profile, in multiples of capital.
 *
 * This is what decides how far the underlying must move: a higher multiple
 * reaches the same target on a smaller move, and loses the capital on a
 * smaller move against it.
 */
export const SCENARIO_LEVERAGE: Record<RiskProfile, number> = {
  conservative: 3,
  moderate: 4,
  aggressive: 5,
};

/** The projection period. Matched to the withdrawal lock so the horizon is one number. */
export const PROJECTION_DAYS = WITHDRAWAL_LOCK_DAYS;

export interface ProjectionInput {
  /** Capital committed, in whole currency units. */
  capital: number;
  riskProfile: RiskProfile;
  /** P_0: the instrument's price when the scenario starts. Must be positive. */
  initialPrice: number;
  /** What is being priced, for display. */
  instrument: string;
  /** Overrides the profile's target. Clamped to the modelled range. */
  targetReturn?: number;
  /** Overrides the profile's leverage. */
  leverage?: number;
  periodDays?: number;
}

export interface Projection {
  capital: number;
  instrument: string;
  riskProfile: RiskProfile;
  /** Fraction of capital, e.g. 0.4. */
  targetReturn: number;
  leverage: number;
  periodDays: number;
  /** Q, in units of the underlying. */
  positionSize: number;
  initialPrice: number;
  /** P_t, solved from the target. */
  projectedPrice: number;
  /** How far the underlying moves in the scenario, as a percentage. */
  requiredPriceMovePct: number;
  /** F(P_0) and F(P_t). */
  initialPositionValue: number;
  projectedPositionValue: number;
  /** dF = Q x (P_t - P_0). */
  projectedPnl: number;
  /** (PnL / capital) x 100. */
  projectedGainPct: number;
  /** capital + PnL. */
  projectedPortfolioValue: number;
}

function clampTarget(value: number): number {
  if (!Number.isFinite(value)) return MIN_TARGET_RETURN;
  return Math.min(MAX_TARGET_RETURN, Math.max(MIN_TARGET_RETURN, value));
}

/**
 * Run the scenario.
 *
 * Returns null rather than zeroes for input that cannot be priced - a capital
 * of zero or a price of zero has no position to value, and a panel showing
 * "$0.00 projected" would read as a result rather than as missing input.
 */
export function projectInvestment(input: ProjectionInput): Projection | null {
  const { capital, riskProfile, initialPrice, instrument } = input;

  if (!Number.isFinite(capital) || capital <= 0) return null;
  if (!Number.isFinite(initialPrice) || initialPrice <= 0) return null;

  const targetReturn = clampTarget(input.targetReturn ?? TARGET_RETURN[riskProfile]);
  const leverage = input.leverage ?? SCENARIO_LEVERAGE[riskProfile];
  const periodDays = input.periodDays ?? PROJECTION_DAYS;

  // Q = C x L / P_0
  const positionSize = (capital * leverage) / initialPrice;
  // P_t = P_0 x (1 + r / L)
  const projectedPrice = initialPrice * (1 + targetReturn / leverage);

  const initialPositionValue = positionSize * initialPrice;
  const projectedPositionValue = positionSize * projectedPrice;
  // dF, computed from the prices - not from capital x target.
  const projectedPnl = positionSize * (projectedPrice - initialPrice);

  return {
    capital,
    instrument,
    riskProfile,
    targetReturn,
    leverage,
    periodDays,
    positionSize,
    initialPrice,
    projectedPrice,
    requiredPriceMovePct: ((projectedPrice - initialPrice) / initialPrice) * 100,
    initialPositionValue,
    projectedPositionValue,
    projectedPnl,
    projectedGainPct: (projectedPnl / capital) * 100,
    projectedPortfolioValue: capital + projectedPnl,
  };
}

/** The modelled band for a given capital, for showing a range rather than a point. */
export function targetBand(capital: number): { min: number; max: number } {
  return {
    min: capital * MIN_TARGET_RETURN,
    max: capital * MAX_TARGET_RETURN,
  };
}
