import mongoose from 'mongoose';
import { WithdrawalModel } from '@/lib/models/Withdrawal';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { UserModel } from '@/lib/models/user';
import { withLedger, UserNotFoundError, InsufficientFundsError } from '@/lib/ledger';
import { createNotification } from '@/lib/notifications';
import type { AdminRequestContext } from './guard';

/**
 * Deciding withdrawals.
 *
 * The mirror of src/lib/admin/deposits.ts, and it inherits that module's rule:
 * approving is one atomic event with four parts - the row transitions, the
 * ledger is debited, the cached balance moves, and the audit log records who
 * did it. Any subset committing alone is a defect that surfaces later as money
 * that left without a decision, or a decision that never took the money.
 *
 * The transition is a conditional update rather than read-then-write, so two
 * operators clicking Approve at the same moment produce one debit.
 *
 * ## Why approval debits and payment does not
 *
 * See src/lib/models/Withdrawal.ts. Approval is the decision point, so it is
 * where funds stop being spendable. Marking paid afterwards records the
 * transaction hash and moves nothing - by then the money has already left the
 * ledger, and debiting again would take it twice.
 */

export class WithdrawalTransitionError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = 'WithdrawalTransitionError';
    this.status = status;
  }
}

/**
 * Derived from the withdrawal id, so a retried approval collides on the
 * ledger's unique index instead of debiting twice.
 */
function withdrawalIdempotencyKey(withdrawalId: string): string {
  return `withdrawal-approve:${withdrawalId}`;
}

export interface ApproveWithdrawalResult {
  withdrawalId: string;
  balanceMinor: number;
  ledgerEntryId: string;
  amountMinor: number;
  deduplicated: boolean;
}

export async function approveWithdrawal(
  ctx: AdminRequestContext,
  withdrawalId: string,
  reviewNote: string
): Promise<ApproveWithdrawalResult> {
  const existing = await WithdrawalModel.findById(withdrawalId).lean();
  if (!existing) throw new WithdrawalTransitionError('Withdrawal not found.', 404);
  if (existing.status !== 'pending') {
    throw new WithdrawalTransitionError(
      `This withdrawal is already ${existing.status}. Reload the queue.`
    );
  }

  return withLedger(async (tx) => {
    const claimed = await WithdrawalModel.findOneAndUpdate(
      { _id: withdrawalId, status: 'pending' },
      {
        $set: {
          status: 'approved',
          reviewNote,
          reviewedByAdminId: ctx.admin.id,
          reviewedAt: new Date(),
        },
      },
      { new: true, session: tx.session }
    ).lean();

    if (!claimed) {
      // Lost the race. Nothing written; the transaction aborts.
      throw new WithdrawalTransitionError(
        'This withdrawal was decided by another operator a moment ago. Reload the queue.'
      );
    }

    const before = await UserModel.findById(claimed.userId)
      .select('walletBalanceMinor')
      .session(tx.session)
      .lean();
    if (!before) throw new UserNotFoundError();

    /*
     * Negative: this takes money out. The ledger refuses to drive a balance
     * below zero, which is the backstop for a request approved against a
     * balance that has moved since it was filed - the trader allocated the
     * capital to a flow in the meantime, say.
     */
    const posted = await tx.post({
      userId: claimed.userId,
      type: 'withdrawal',
      amountMinor: -claimed.amountMinor,
      idempotencyKey: withdrawalIdempotencyKey(String(claimed._id)),
      actorAdminId: ctx.admin.id,
      memo: `Withdrawal of ${claimed.coin} on ${claimed.networkKey} to ${claimed.destinationAddress}`,
    });

    await WithdrawalModel.updateOne(
      { _id: claimed._id },
      { $set: { ledgerEntryId: posted.entryId } },
      { session: tx.session }
    );

    await AdminAuditLogModel.create(
      [
        {
          actorAdminId: ctx.admin.id,
          actorEmail: ctx.admin.email,
          actorRole: ctx.admin.role,
          action: 'withdrawal.approve',
          targetType: 'withdrawal',
          targetId: String(claimed._id),
          affectedUserId: claimed.userId,
          before: { status: 'pending', walletBalanceMinor: before.walletBalanceMinor ?? 0 },
          after: {
            status: 'approved',
            walletBalanceMinor: posted.balanceMinor,
            amountMinor: claimed.amountMinor,
          },
          reason: reviewNote || 'Withdrawal approved.',
          reference: claimed.destinationAddress,
          ip: ctx.ip,
          userAgent: ctx.userAgent.slice(0, 400),
          sessionId: ctx.sessionId,
        },
      ],
      { session: tx.session }
    );

    return {
      withdrawalId: String(claimed._id),
      balanceMinor: posted.balanceMinor,
      ledgerEntryId: posted.entryId,
      amountMinor: claimed.amountMinor,
      deduplicated: posted.deduplicated,
    };
  });
}

export async function rejectWithdrawal(
  ctx: AdminRequestContext,
  withdrawalId: string,
  reason: string
): Promise<{ withdrawalId: string; reason: string }> {
  const existing = await WithdrawalModel.findById(withdrawalId).lean();
  if (!existing) throw new WithdrawalTransitionError('Withdrawal not found.', 404);
  if (existing.status !== 'pending') {
    throw new WithdrawalTransitionError(
      `This withdrawal is already ${existing.status}. Reload the queue.`
    );
  }

  const claimed = await WithdrawalModel.findOneAndUpdate(
    { _id: withdrawalId, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        rejectionReason: reason,
        reviewedByAdminId: ctx.admin.id,
        reviewedAt: new Date(),
      },
    },
    { new: true }
  ).lean();

  if (!claimed) {
    throw new WithdrawalTransitionError(
      'This withdrawal was decided by another operator a moment ago. Reload the queue.'
    );
  }

  // No transaction: a rejection moves no money, so there is one write that
  // matters and the audit entry cannot disagree with a balance.
  await AdminAuditLogModel.create({
    actorAdminId: ctx.admin.id,
    actorEmail: ctx.admin.email,
    actorRole: ctx.admin.role,
    action: 'withdrawal.reject',
    targetType: 'withdrawal',
    targetId: String(claimed._id),
    affectedUserId: claimed.userId,
    before: { status: 'pending' },
    after: { status: 'rejected' },
    reason,
    reference: claimed.destinationAddress,
    ip: ctx.ip,
    userAgent: ctx.userAgent.slice(0, 400),
    sessionId: ctx.sessionId,
  });

  return { withdrawalId: String(claimed._id), reason };
}

/**
 * Record that an approved withdrawal has actually been sent.
 *
 * Moves no money - the debit happened at approval. What this adds is the
 * on-chain reference, which is the only thing that lets anyone later prove the
 * payment was made. The transaction hash is therefore required, not optional.
 */
export async function markWithdrawalPaid(
  ctx: AdminRequestContext,
  withdrawalId: string,
  txReference: string
): Promise<{ withdrawalId: string; txReference: string }> {
  const existing = await WithdrawalModel.findById(withdrawalId).lean();
  if (!existing) throw new WithdrawalTransitionError('Withdrawal not found.', 404);
  if (existing.status !== 'approved') {
    throw new WithdrawalTransitionError(
      existing.status === 'paid'
        ? 'This withdrawal is already marked paid.'
        : `Only an approved withdrawal can be marked paid; this one is ${existing.status}.`
    );
  }

  const claimed = await WithdrawalModel.findOneAndUpdate(
    { _id: withdrawalId, status: 'approved' },
    {
      $set: {
        status: 'paid',
        txReference,
        paidByAdminId: ctx.admin.id,
        paidAt: new Date(),
      },
    },
    { new: true }
  ).lean();

  if (!claimed) {
    throw new WithdrawalTransitionError(
      'This withdrawal changed while you were working on it. Reload the queue.'
    );
  }

  await AdminAuditLogModel.create({
    actorAdminId: ctx.admin.id,
    actorEmail: ctx.admin.email,
    actorRole: ctx.admin.role,
    action: 'withdrawal.paid',
    targetType: 'withdrawal',
    targetId: String(claimed._id),
    affectedUserId: claimed.userId,
    before: { status: 'approved' },
    after: { status: 'paid' },
    reason: 'Transfer sent.',
    reference: txReference,
    ip: ctx.ip,
    userAgent: ctx.userAgent.slice(0, 400),
    sessionId: ctx.sessionId,
  });

  return { withdrawalId: String(claimed._id), txReference };
}

/**
 * Tell the trader what happened.
 *
 * Outside the transaction, like the deposit equivalent: a notification that
 * fails to send must not roll back a correctly-approved debit.
 */
export async function notifyWithdrawalDecision(
  withdrawal: { userId: mongoose.Types.ObjectId | string; coin: string; networkKey: string },
  decision: { status: 'approved' | 'rejected' | 'paid'; amountMinor?: number; reason?: string }
): Promise<void> {
  const amount = ((decision.amountMinor ?? 0) / 100).toFixed(2);

  if (decision.status === 'approved') {
    await createNotification({
      userId: String(withdrawal.userId),
      type: 'wallet',
      title: 'Withdrawal approved',
      body: `Your withdrawal of $${amount} has been approved and debited from your wallet. The transfer on ${withdrawal.networkKey} will follow shortly.`,
      href: '/dashboard/withdraw',
    });
    return;
  }

  if (decision.status === 'paid') {
    await createNotification({
      userId: String(withdrawal.userId),
      type: 'wallet',
      title: 'Withdrawal sent',
      body: `Your ${withdrawal.coin} withdrawal has been sent on ${withdrawal.networkKey}. The transaction reference is on your withdrawals page.`,
      href: '/dashboard/withdraw',
    });
    return;
  }

  await createNotification({
    userId: String(withdrawal.userId),
    type: 'wallet',
    title: 'Withdrawal declined',
    body: decision.reason
      ? `${decision.reason} Nothing has been taken from your wallet. Contact support if you believe this is a mistake.`
      : 'Your withdrawal could not be processed. Nothing has been taken from your wallet.',
    href: '/dashboard/withdraw',
  });
}

/** Shape returned to the console's queue. */
export function serializeWithdrawalForConsole(row: Record<string, unknown>) {
  const user = row.userId as {
    _id?: mongoose.Types.ObjectId;
    name?: string;
    email?: string;
  } | null;

  return {
    id: String(row._id),
    userId: user?._id ? String(user._id) : String(row.userId),
    userName: user?.name ?? null,
    userEmail: user?.email ?? null,
    amountMinor: row.amountMinor as number,
    networkKey: row.networkKey as string,
    coin: row.coin as string,
    destinationAddress: row.destinationAddress as string,
    destinationMemo: (row.destinationMemo as string) || null,
    horizonAtRequest: row.horizonAtRequest as string,
    unlockedAt: (row.unlockedAt as Date | null) ?? null,
    status: row.status as string,
    reviewNote: (row.reviewNote as string) || '',
    rejectionReason: (row.rejectionReason as string) || '',
    txReference: (row.txReference as string) || '',
    reviewedAt: (row.reviewedAt as Date | null) ?? null,
    paidAt: (row.paidAt as Date | null) ?? null,
    createdAt: row.createdAt as Date,
  };
}

export { InsufficientFundsError };
