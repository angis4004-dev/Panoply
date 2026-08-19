import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { WithdrawalModel } from '@/lib/models/Withdrawal';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { withdrawalDecisionSchema } from '@/lib/admin/validation';
import { objectId, parseBody } from '@/lib/validation';
import {
  WithdrawalTransitionError,
  approveWithdrawal,
  markWithdrawalPaid,
  notifyWithdrawalDecision,
  rejectWithdrawal,
} from '@/lib/admin/withdrawals';
import { InsufficientFundsError, UserNotFoundError } from '@/lib/ledger';

/**
 * Decide one withdrawal.
 *
 * Thin, like the deposit equivalent. Everything that has to be atomic - the
 * transition, the ledger debit, the balance, the audit entry - happens inside
 * approveWithdrawal in a single transaction. Anything this handler did between
 * those steps would be a place for them to come apart.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'withdrawal.review');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid withdrawal id' }, { status: 400 });
  }

  const { data: body, error: invalid } = await parseBody(request, withdrawalDecisionSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  // Read before the decision so the notification has the coin and network even
  // after the row has moved on.
  const subject = await WithdrawalModel.findById(id).select('userId coin networkKey').lean();

  try {
    if (body.action === 'approve') {
      const result = await approveWithdrawal(ctx, id, body.reviewNote ?? '');
      if (subject) {
        await notifyWithdrawalDecision(subject, {
          status: 'approved',
          amountMinor: result.amountMinor,
        });
      }
      return adminJson({
        withdrawal: { id: result.withdrawalId, status: 'approved' },
        balanceMinor: result.balanceMinor,
        ledgerEntryId: result.ledgerEntryId,
        deduplicated: result.deduplicated,
      });
    }

    if (body.action === 'reject') {
      const result = await rejectWithdrawal(ctx, id, body.reason);
      if (subject) {
        await notifyWithdrawalDecision(subject, { status: 'rejected', reason: result.reason });
      }
      return adminJson({ withdrawal: { id: result.withdrawalId, status: 'rejected' } });
    }

    const result = await markWithdrawalPaid(ctx, id, body.txReference);
    if (subject) {
      await notifyWithdrawalDecision(subject, { status: 'paid' });
    }
    return adminJson({
      withdrawal: { id: result.withdrawalId, status: 'paid', txReference: result.txReference },
    });
  } catch (error) {
    if (error instanceof WithdrawalTransitionError) {
      return adminJson({ error: error.message }, { status: error.status });
    }
    if (error instanceof InsufficientFundsError) {
      /*
       * The balance moved between the request being filed and this approval -
       * the trader allocated the capital to a signal flow in the meantime, for
       * instance. Refusing here is correct: the ledger will not go negative,
       * and the operator needs to know rather than see a silent no-op.
       */
      return adminJson(
        {
          error:
            'The trader no longer holds this amount. Their balance changed after the request was filed, so it cannot be approved.',
        },
        { status: 409 }
      );
    }
    if (error instanceof UserNotFoundError) {
      return adminJson(
        { error: 'The trader on this withdrawal no longer exists.' },
        { status: 404 }
      );
    }
    throw error;
  }
}
