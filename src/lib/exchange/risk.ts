import type { RiskLimits } from '@/lib/models/TradingControl';
import { toMinorUnits } from './types';

/**
 * The last thing between a strategy and a real order.
 *
 * Pure: limits and current state in, a refusal or null out. No database, no
 * clock of its own. Every one of these is a loss the platform can suffer
 * without anything throwing an error - a strategy that is simply wrong loses
 * money correctly, and only a ceiling stops it.
 *
 * Ordering matters. The halt is checked first because it must override
 * everything, then the cheap arithmetic, then the checks that need context the
 * caller had to go and fetch. A refusal returns the first reason found, which
 * is the most fundamental one rather than an arbitrary one.
 */

export interface RiskContext {
  /** Quote-currency notional of the order being considered. */
  orderNotional: number;
  /** Value the flow already holds, before this order. */
  currentBotPositionValue: number;
  /** Value the trader holds across every flow, before this order. */
  currentUserExposure: number;
  /** Platform-wide realized loss so far today, as a positive number. */
  realizedLossTodayMinor: number;
  /** When this flow last had an order placed. Null if never. */
  lastOrderAt: Date | null;
  now: Date;
  side: 'buy' | 'sell';
}

export interface RiskDecision {
  allowed: boolean;
  /** Present when refused. Safe to log and to show an operator. */
  reason?: string;
  /** True when the refusal is temporary and retrying later is sensible. */
  transient?: boolean;
}

const ALLOWED: RiskDecision = { allowed: true };

function refuse(reason: string, transient = false): RiskDecision {
  return { allowed: false, reason, transient };
}

/**
 * Whether this order may be placed.
 *
 * Sells are treated differently from buys throughout, and deliberately: every
 * exposure limit exists to stop the platform taking on more risk, and a sell
 * reduces risk. A position over its ceiling - because the ceiling was lowered,
 * or the market moved - must still be closable, so the exposure checks apply
 * to buys only. Blocking a sell to enforce a position limit would trap a flow
 * in exactly the position the limit says is too large.
 */
export function checkRisk(limits: RiskLimits, context: RiskContext): RiskDecision {
  if (limits.tradingHalted) {
    return refuse(limits.haltedReason || 'Trading is halted.', true);
  }

  if (!Number.isFinite(context.orderNotional) || context.orderNotional <= 0) {
    return refuse('Order notional is not a usable number.');
  }

  const notionalMinor = toMinorUnits(context.orderNotional);

  if (limits.maxOrderNotionalMinor > 0 && notionalMinor > limits.maxOrderNotionalMinor) {
    return refuse(
      `Order of ${formatMinor(notionalMinor)} exceeds the ${formatMinor(limits.maxOrderNotionalMinor)} single-order limit.`
    );
  }

  /*
   * The daily loss backstop. Applies to buys only: once it trips, the platform
   * should stop opening new risk, but positions already held still have to be
   * closable - and closing them is the most likely thing an operator wants to
   * do at that moment.
   */
  if (
    context.side === 'buy' &&
    limits.maxDailyLossMinor > 0 &&
    context.realizedLossTodayMinor >= limits.maxDailyLossMinor
  ) {
    return refuse(
      `Platform daily loss limit of ${formatMinor(limits.maxDailyLossMinor)} has been reached. No new positions today.`,
      true
    );
  }

  if (context.side === 'buy') {
    const projectedBot = toMinorUnits(context.currentBotPositionValue + context.orderNotional);
    if (limits.maxBotPositionMinor > 0 && projectedBot > limits.maxBotPositionMinor) {
      return refuse(
        `This would take the flow to ${formatMinor(projectedBot)}, over its ${formatMinor(limits.maxBotPositionMinor)} position limit.`
      );
    }

    const projectedUser = toMinorUnits(context.currentUserExposure + context.orderNotional);
    if (limits.maxUserExposureMinor > 0 && projectedUser > limits.maxUserExposureMinor) {
      return refuse(
        `This would take the trader to ${formatMinor(projectedUser)}, over their ${formatMinor(limits.maxUserExposureMinor)} exposure limit.`
      );
    }
  }

  /*
   * Rate limit. Applies to both sides: a loop placing sells is as expensive in
   * fees as one placing buys, and a strategy oscillating between the two is
   * the most expensive case of all.
   */
  if (limits.minSecondsBetweenOrders > 0 && context.lastOrderAt) {
    const elapsedSeconds = (context.now.getTime() - context.lastOrderAt.getTime()) / 1000;
    if (elapsedSeconds < limits.minSecondsBetweenOrders) {
      const wait = Math.ceil(limits.minSecondsBetweenOrders - elapsedSeconds);
      return refuse(`Too soon since the last order on this flow. ${wait}s to wait.`, true);
    }
  }

  return ALLOWED;
}

function formatMinor(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}
