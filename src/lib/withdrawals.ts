import mongoose from 'mongoose';
import { UserModel } from '@/lib/models/user';
import { WithdrawalModel } from '@/lib/models/Withdrawal';
import {
  computeLockStatus,
  computeWithdrawableMinor,
  HORIZON_LABELS,
  type InvestmentHorizon,
  type LockStatus,
} from '@/lib/withdrawal-rules';

/**
 * One place that answers "what may this trader withdraw, and why not".
 *
 * The trader's screen, the request endpoint and the operator's queue all need
 * this answer, and they must agree. Computing it three times is how a UI ends
 * up offering a button the API then refuses - so it is computed once here and
 * every caller reads the same object.
 *
 * The rules themselves stay in src/lib/withdrawal-rules.ts, which is pure and
 * tested. This file is only the database gathering around them.
 */

/**
 * The horizon recorded when the trader has never chosen one.
 *
 * It no longer decides anything: every trader unlocks 14 days after their
 * investment starts. This only fills the field on the account and on the
 * record of each request, and stays "short" so an unanswered question is
 * never reported as a longer commitment than the trader agreed to.
 */
const DEFAULT_HORIZON: InvestmentHorizon = 'short';

export interface WithdrawalStanding {
  horizon: InvestmentHorizon;
  horizonLabel: string;
  /** True when the trader never picked a horizon and DEFAULT_HORIZON applied. */
  horizonAssumed: boolean;
  lock: LockStatus;
  balanceMinor: number;
  /** Already claimed by requests that have not been paid or rejected. */
  pendingMinor: number;
  withdrawableMinor: number;
  kycStatus: string;
  walletOwnershipConfirmed: boolean;
  hasPendingRequest: boolean;
}

/**
 * Gather everything the withdrawal rules need for one trader.
 *
 * `pendingMinor` counts both `pending` and `approved` rows. An approved
 * request has already debited the ledger, so counting it again would
 * double-subtract - except that the debit is exactly why it must still be
 * visible to the caller deciding whether another request is allowed. The
 * balance read here is post-debit, and the model's partial unique index means
 * at most one such row exists, so the two cannot compound.
 */
export async function getWithdrawalStanding(
  userId: string | mongoose.Types.ObjectId,
  now: Date = new Date()
): Promise<WithdrawalStanding | null> {
  const user = await UserModel.findById(userId)
    .select(
      'walletBalanceMinor kycStatus walletOwnershipConfirmed investmentHorizon tradingStartedAt firstDepositApprovedAt'
    )
    .lean();

  if (!user) return null;

  const horizonAssumed = user.investmentHorizon !== 'short' && user.investmentHorizon !== 'long';
  const horizon: InvestmentHorizon = horizonAssumed
    ? DEFAULT_HORIZON
    : (user.investmentHorizon as InvestmentHorizon);

  const realLock = computeLockStatus(
    {
      firstDepositApprovedAt: user.firstDepositApprovedAt ?? null,
      tradingStartedAt: user.tradingStartedAt ?? null,
    },
    now
  );

  /*
   * The lock as computed, with no way to release it from configuration.
   *
   * A DEMO_MODE environment flag used to unlock the term here so the
   * withdrawal screen could be demonstrated. It is gone: the term decides
   * when real capital may leave the platform, and nothing in an env file
   * should be able to lift it on a deployment holding real money.
   */
  const lock: LockStatus = realLock;

  const live = await WithdrawalModel.find({
    userId,
    status: { $in: ['pending', 'approved'] },
  })
    .select('amountMinor status')
    .lean();

  const pendingMinor = live.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0);
  const balanceMinor = user.walletBalanceMinor ?? 0;

  return {
    horizon,
    horizonLabel: HORIZON_LABELS[horizon],
    horizonAssumed,
    lock,
    balanceMinor,
    pendingMinor,
    withdrawableMinor: computeWithdrawableMinor({ balanceMinor, pendingMinor, lock }),
    kycStatus: user.kycStatus ?? 'unverified',
    walletOwnershipConfirmed: Boolean(user.walletOwnershipConfirmed),
    hasPendingRequest: live.length > 0,
  };
}

/** A withdrawal row as the trader's own screen shows it. */
export function serializeWithdrawal(row: Record<string, unknown>) {
  return {
    id: String(row._id),
    amountMinor: row.amountMinor as number,
    networkKey: row.networkKey as string,
    coin: row.coin as string,
    destinationAddress: row.destinationAddress as string,
    destinationMemo: (row.destinationMemo as string) || null,
    status: row.status as string,
    // Present only once an operator has acted, so the trader is not shown an
    // empty "reason" field on a request nobody has looked at yet.
    rejectionReason: (row.rejectionReason as string) || null,
    txReference: (row.txReference as string) || null,
    reviewedAt: (row.reviewedAt as Date | null) ?? null,
    paidAt: (row.paidAt as Date | null) ?? null,
    createdAt: row.createdAt as Date,
  };
}
