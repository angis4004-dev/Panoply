import mongoose from 'mongoose';
import { DepositModel, type IDeposit } from '@/lib/models/Deposit';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { UserModel } from '@/lib/models/user';
import { withLedger, UserNotFoundError } from '@/lib/ledger';
import { createNotification } from '@/lib/notifications';
import {
  DepositTransitionError,
  assertDecidable,
  depositIdempotencyKey,
  planApproval,
  planRejection,
  type ApprovalInput,
} from './deposit-rules';
import type { AdminRequestContext } from './guard';

/**
 * Authorizing and refusing deposits.
 *
 * The whole point of this module is that approving a deposit is one atomic
 * event with four parts: the row moves out of pending, the ledger gains an
 * entry, the user's cached balance moves, and the audit log records who did it
 * on what evidence. Any subset of those committing without the others is a
 * defect that shows up later as an unexplained balance, a double credit, or an
 * approval nobody can account for.
 *
 * So all four happen inside one MongoDB transaction, and the row transition is
 * expressed as a conditional update rather than a read followed by a write -
 * which is what makes two reviewers clicking Approve at the same moment
 * produce one credit instead of two.
 */

export interface ApproveResult {
  depositId: string;
  balanceMinor: number;
  ledgerEntryId: string;
  creditAmountMinor: number;
  /** True when the ledger recognised this as a replay and no money moved. */
  deduplicated: boolean;
}

export async function authorizeDeposit(
  ctx: AdminRequestContext,
  depositId: string,
  input: ApprovalInput
): Promise<ApproveResult> {
  const plan = planApproval(input);

  // Read first purely to produce a useful message. The write below is what
  // actually decides the outcome - between these two statements another
  // reviewer may well have approved it, and the conditional update is what
  // catches that.
  const existing = await DepositModel.findById(depositId).lean();
  if (!existing) throw new DepositTransitionError('Deposit not found.', 404);
  assertDecidable(existing.status);

  return withLedger(async (tx) => {
    const claimed = await DepositModel.findOneAndUpdate(
      { _id: depositId, status: 'pending' },
      {
        $set: {
          status: 'approved',
          creditAmountMinor: plan.creditAmountMinor,
          txReference: plan.txReference,
          reviewNote: plan.reviewNote,
          reviewedByAdminId: ctx.admin.id,
          reviewedAt: new Date(),
        },
      },
      { new: true, session: tx.session }
    ).lean();

    if (!claimed) {
      // Lost the race. Nothing has been written; the transaction aborts.
      throw new DepositTransitionError(
        'This deposit was decided by another operator a moment ago. Reload the queue.'
      );
    }

    const balanceBefore = await UserModel.findById(claimed.userId)
      .select('walletBalanceMinor')
      .session(tx.session)
      .lean();
    if (!balanceBefore) throw new UserNotFoundError();

    const posted = await tx.post({
      userId: claimed.userId,
      type: 'deposit',
      amountMinor: plan.creditAmountMinor,
      // Derived from the deposit id, so a retried authorization collides on
      // the ledger's unique index instead of crediting twice.
      idempotencyKey: depositIdempotencyKey(String(claimed._id)),
      actorAdminId: ctx.admin.id,
      memo: `Deposit ${claimed.coin} on ${claimed.network}, ref ${plan.txReference}`,
      // Keeps the tier engine's lifetime figure consistent with the deposits
      // that produced it, in the same transaction rather than as a follow-up
      // write that can fail on its own.
      alsoIncrement: { lifetimeDeposited: plan.creditAmountMinor / 100 },
    });

    await DepositModel.updateOne(
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
          action: 'deposit.approve',
          targetType: 'deposit',
          targetId: String(claimed._id),
          affectedUserId: claimed.userId,
          before: {
            status: 'pending',
            walletBalanceMinor: balanceBefore.walletBalanceMinor ?? 0,
          },
          after: {
            status: 'approved',
            walletBalanceMinor: posted.balanceMinor,
            creditAmountMinor: plan.creditAmountMinor,
          },
          reason: plan.reviewNote || 'Deposit authorized after confirming payment evidence.',
          reference: plan.txReference,
          ip: ctx.ip,
          userAgent: ctx.userAgent.slice(0, 400),
          sessionId: ctx.sessionId,
        },
      ],
      { session: tx.session }
    );

    return {
      depositId: String(claimed._id),
      balanceMinor: posted.balanceMinor,
      ledgerEntryId: posted.entryId,
      creditAmountMinor: plan.creditAmountMinor,
      deduplicated: posted.deduplicated,
    };
  });
}

export async function rejectDeposit(
  ctx: AdminRequestContext,
  depositId: string,
  reason: unknown
): Promise<{ depositId: string; reason: string }> {
  const trimmed = planRejection(reason);

  const existing = await DepositModel.findById(depositId).lean();
  if (!existing) throw new DepositTransitionError('Deposit not found.', 404);
  assertDecidable(existing.status);

  const claimed = await DepositModel.findOneAndUpdate(
    { _id: depositId, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        rejectionReason: trimmed,
        reviewedByAdminId: ctx.admin.id,
        reviewedAt: new Date(),
      },
    },
    { new: true }
  ).lean();

  if (!claimed) {
    throw new DepositTransitionError(
      'This deposit was decided by another operator a moment ago. Reload the queue.'
    );
  }

  // No transaction here: a rejection moves no money, so there is only one
  // write that matters and the audit entry can follow it without the two
  // being able to disagree about a balance.
  await AdminAuditLogModel.create({
    actorAdminId: ctx.admin.id,
    actorEmail: ctx.admin.email,
    actorRole: ctx.admin.role,
    action: 'deposit.reject',
    targetType: 'deposit',
    targetId: String(claimed._id),
    affectedUserId: claimed.userId,
    before: { status: 'pending' },
    after: { status: 'rejected' },
    reason: trimmed,
    reference: claimed.txReference,
    ip: ctx.ip,
    userAgent: ctx.userAgent.slice(0, 400),
    sessionId: ctx.sessionId,
  });

  return { depositId: String(claimed._id), reason: trimmed };
}

/**
 * Tells the trader what happened to their deposit.
 *
 * Outside the transaction on purpose. A notification that fails to send must
 * not roll back a credit that was correctly authorized - the money is right,
 * the bell entry is recoverable, and createNotification already swallows its
 * own errors rather than throwing into a caller.
 */
export async function notifyDepositDecision(
  deposit: Pick<IDeposit, 'userId' | 'coin' | 'network'>,
  decision: { approved: boolean; creditAmountMinor?: number; reason?: string }
): Promise<void> {
  if (decision.approved) {
    const amount = ((decision.creditAmountMinor ?? 0) / 100).toFixed(2);
    await createNotification({
      userId: String(deposit.userId),
      type: 'wallet',
      title: 'Deposit credited',
      body: `Your ${deposit.coin} deposit on ${deposit.network} has been confirmed and $${amount} has been credited to your wallet.`,
      href: '/dashboard',
    });
    return;
  }

  await createNotification({
    userId: String(deposit.userId),
    type: 'wallet',
    title: 'Deposit could not be credited',
    body: decision.reason
      ? `${decision.reason} Contact support if you believe this is a mistake.`
      : 'Your deposit could not be confirmed. Contact support if you believe this is a mistake.',
    href: '/dashboard',
  });
}

/** Shape returned to the console's queue. */
export function serializeDeposit(deposit: Record<string, unknown>) {
  const user = deposit.userId as {
    _id?: mongoose.Types.ObjectId;
    name?: string;
    email?: string;
  } | null;
  return {
    id: String(deposit._id),
    userId: user?._id ? String(user._id) : String(deposit.userId),
    userName: user?.name ?? null,
    userEmail: user?.email ?? null,
    coin: deposit.coin as string,
    network: deposit.network as string,
    address: deposit.address as string,
    memoTag: (deposit.memoTag as string) || null,
    assetAmount: deposit.assetAmount as string,
    creditAmountMinor: (deposit.creditAmountMinor as number | null) ?? null,
    txReference: deposit.txReference as string,
    status: deposit.status as string,
    source: deposit.source as string,
    reviewNote: (deposit.reviewNote as string) || '',
    rejectionReason: (deposit.rejectionReason as string) || '',
    reviewedAt: (deposit.reviewedAt as Date | null) ?? null,
    createdAt: deposit.createdAt as Date,
  };
}
