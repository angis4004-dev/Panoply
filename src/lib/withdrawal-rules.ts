/**
 * When a trader's capital unlocks, and how much of it they may take.
 *
 * Pure functions over plain values - no database, no clock of its own. Every
 * time is passed in, which is what makes the boundary cases testable rather
 * than something you find out about from a customer three months after
 * launch.
 *
 * The policy, stated once:
 *
 *   clockStart = the LATER of (first deposit approved, first signal flow
 *                started). Money must be in AND working before the lock
 *                begins counting.
 *   unlock     = clockStart + 3 months  (short horizon)
 *                clockStart + 12 months (long horizon)
 *
 * Both conditions are required on purpose. Starting from the deposit alone
 * would let someone deposit, never trade, and withdraw on schedule - the
 * platform would be a term deposit account. Starting from the first flow
 * alone would let someone start a flow with an empty wallet, wait out the
 * term, then deposit and withdraw immediately.
 */

/** How long capital is committed. Chosen by the trader, not derived. */
export type InvestmentHorizon = 'short' | 'long';

export const HORIZON_MONTHS: Record<InvestmentHorizon, number> = {
  short: 3,
  long: 12,
};

export const HORIZON_LABELS: Record<InvestmentHorizon, string> = {
  short: 'Short term (3 months)',
  long: 'Long term (12 months)',
};

export function isInvestmentHorizon(value: unknown): value is InvestmentHorizon {
  return value === 'short' || value === 'long';
}

export interface LockInput {
  /** When an operator approved the trader's first deposit. Null if none yet. */
  firstDepositApprovedAt?: Date | null;
  /** When the trader's first signal flow started running. Null if none yet. */
  tradingStartedAt?: Date | null;
  horizon: InvestmentHorizon;
}

export type LockReason =
  /** Neither condition met, or only one of them. */
  | 'not_started'
  /** Clock running, term not yet elapsed. */
  | 'locked'
  /** Term elapsed - capital may be withdrawn. */
  | 'unlocked';

export interface LockStatus {
  reason: LockReason;
  /** When the term began. Null while either condition is outstanding. */
  clockStartsAt: Date | null;
  /** When capital becomes withdrawable. Null while the clock has not started. */
  unlocksAt: Date | null;
  /** Convenience for callers that only need the yes/no. */
  withdrawable: boolean;
  /** What the trader is still waiting on, for the UI to state plainly. */
  awaiting: 'deposit' | 'trading' | 'both' | null;
}

/**
 * Adds whole months, clamping to the end of a shorter target month.
 *
 * Date's own setMonth rolls over: 31 January plus one month lands on 3 March,
 * because 31 February does not exist. For a lock that decides when someone
 * gets their money back, silently granting two extra days is not acceptable
 * in either direction, so a deposit made on the 31st unlocks on the 30th (or
 * 28th) rather than sliding into the following month.
 */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const targetMonth = result.getMonth() + months;
  const dayOfMonth = result.getDate();

  result.setDate(1);
  result.setMonth(targetMonth);

  // Last day of the month we landed on: day 0 of the next month.
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(dayOfMonth, lastDay));

  return result;
}

export function computeLockStatus(input: LockInput, now: Date): LockStatus {
  const { firstDepositApprovedAt, tradingStartedAt, horizon } = input;

  const hasDeposit = firstDepositApprovedAt instanceof Date;
  const hasTrading = tradingStartedAt instanceof Date;

  if (!hasDeposit || !hasTrading) {
    return {
      reason: 'not_started',
      clockStartsAt: null,
      unlocksAt: null,
      withdrawable: false,
      awaiting: !hasDeposit && !hasTrading ? 'both' : !hasDeposit ? 'deposit' : 'trading',
    };
  }

  // The later of the two. Both conditions must hold before the term runs.
  const clockStartsAt =
    firstDepositApprovedAt.getTime() >= tradingStartedAt.getTime()
      ? firstDepositApprovedAt
      : tradingStartedAt;

  const unlocksAt = addMonths(clockStartsAt, HORIZON_MONTHS[horizon]);

  // Inclusive: on the unlock date itself the money is available. A trader
  // told "unlocks 14 May" who is refused on 14 May has been misled.
  const unlocked = now.getTime() >= unlocksAt.getTime();

  return {
    reason: unlocked ? 'unlocked' : 'locked',
    clockStartsAt,
    unlocksAt,
    withdrawable: unlocked,
    awaiting: null,
  };
}

export interface WithdrawableInput {
  /** Ledger balance in minor units. Real money only - never simulated P&L. */
  balanceMinor: number;
  /** Sum of requests already pending, so the same funds cannot be claimed twice. */
  pendingMinor: number;
  lock: LockStatus;
}

/**
 * How much may be requested right now.
 *
 * Deliberately derived from the ledger balance and nothing else. Signal-flow
 * P&L is a simulation (src/lib/bot-pnl.ts) and must never widen this number -
 * paying it out would mean sending real money against a random walk.
 *
 * Pending requests are subtracted because a request is a claim on the balance
 * that has not yet been debited. Without this, a trader with 100 could file
 * two requests for 100 and, if both were approved, overdraw the ledger.
 */
export function computeWithdrawableMinor(input: WithdrawableInput): number {
  if (!input.lock.withdrawable) return 0;
  return Math.max(0, input.balanceMinor - Math.max(0, input.pendingMinor));
}

/** Why a specific requested amount cannot be accepted, or null if it can. */
export function validateWithdrawalRequest(params: {
  amountMinor: number;
  withdrawableMinor: number;
  kycStatus: string;
  /**
   * Whether the destination the trader named has been confirmed as theirs.
   *
   * This replaces a check on `user.walletOwnershipConfirmed`, which was a
   * single platform-wide boolean tied to `user.walletAddress` - an address the
   * platform assigned. That field is empty on essentially every account, and
   * the only thing that could set the boolean was a settings-page button which
   * itself only rendered when the address was non-empty. The gate was therefore
   * unsatisfiable: withdrawal was refused for every trader, with no route to
   * ever pass it.
   *
   * The per-address confirmation is also the stronger check. It is recorded
   * against one destination on one chain, after that address has been
   * validated against that chain's format rule - so it answers "is THIS the
   * right place to send" rather than "has this person ever confirmed anything".
   * See confirmedAt on src/lib/models/PayoutAddress.ts.
   */
  addressConfirmed: boolean;
  hasPendingRequest: boolean;
  lock: LockStatus;
  /**
   * The chain's own floor, in minor units, or null for none. Chains differ by
   * orders of magnitude in what a transfer costs, so this is per-network
   * rather than platform-wide - see minWithdrawalMinor on the Network model.
   */
  networkMinimumMinor?: number | null;
  /** For the message. Falls back to a generic phrasing. */
  networkName?: string;
}): string | null {
  const {
    amountMinor,
    withdrawableMinor,
    kycStatus,
    addressConfirmed,
    hasPendingRequest,
    lock,
    networkMinimumMinor = null,
    networkName = 'this network',
  } = params;

  if (kycStatus !== 'verified') {
    return 'Complete identity verification before withdrawing.';
  }
  // Without a confirmed destination there is no address an operator could
  // safely send to. Saving a payout wallet records the confirmation.
  if (!addressConfirmed) {
    return 'Confirm ownership of your payout wallet before withdrawing.';
  }
  if (hasPendingRequest) {
    return 'You already have a withdrawal awaiting review.';
  }
  if (lock.reason === 'not_started') {
    return lock.awaiting === 'deposit'
      ? 'Your term begins once your first deposit is approved.'
      : lock.awaiting === 'trading'
        ? 'Your term begins once your first signal flow starts running.'
        : 'Your term begins once you have deposited and started a signal flow.';
  }
  if (lock.reason === 'locked') {
    return 'Your capital is still within its committed term.';
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return 'Enter a valid amount.';
  }
  /*
   * The network floor is checked before the balance. Someone asking for less
   * than the chain permits needs to hear that, not "you cannot afford it" -
   * and the two are easy to hit together, because the amounts that fall under
   * a floor are small ones.
   */
  if (networkMinimumMinor !== null && amountMinor < networkMinimumMinor) {
    const formatted = (networkMinimumMinor / 100).toFixed(2);
    return `The minimum withdrawal on ${networkName} is $${formatted}.`;
  }
  if (amountMinor > withdrawableMinor) {
    return 'Amount exceeds your withdrawable balance.';
  }
  return null;
}
