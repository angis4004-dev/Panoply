import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { DepositModel } from '@/lib/models/Deposit';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { depositDecisionSchema } from '@/lib/admin/validation';
import { objectId, parseBody } from '@/lib/validation';
import { authorizeDeposit, notifyDepositDecision, rejectDeposit } from '@/lib/admin/deposits';
import { DepositTransitionError } from '@/lib/admin/deposit-rules';
import { UserNotFoundError } from '@/lib/ledger';

/**
 * Authorize or refuse one deposit.
 *
 * The endpoint is thin on purpose. Everything that has to be atomic - the
 * status transition, the ledger entry, the balance, the audit record - is in
 * authorizeDeposit, inside one transaction. Anything this handler did between
 * those steps would be a place for them to come apart.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'deposit.authorize');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid deposit id' }, { status: 400 });
  }

  const { data: body, error: invalid } = await parseBody(request, depositDecisionSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  try {
    if (body.action === 'approve') {
      const result = await authorizeDeposit(ctx, id, {
        creditAmountMinor: body.creditAmountMinor,
        txReference: body.txReference,
        reviewNote: body.reviewNote,
      });

      const deposit = await DepositModel.findById(id).select('userId coin network').lean();
      if (deposit) {
        await notifyDepositDecision(deposit, {
          approved: true,
          creditAmountMinor: result.creditAmountMinor,
        });
      }

      return adminJson({
        deposit: { id: result.depositId, status: 'approved' },
        balanceMinor: result.balanceMinor,
        ledgerEntryId: result.ledgerEntryId,
        deduplicated: result.deduplicated,
      });
    }

    const deposit = await DepositModel.findById(id).select('userId coin network').lean();
    const result = await rejectDeposit(ctx, id, body.reason);
    if (deposit) {
      await notifyDepositDecision(deposit, { approved: false, reason: result.reason });
    }

    return adminJson({ deposit: { id: result.depositId, status: 'rejected' } });
  } catch (error) {
    if (error instanceof DepositTransitionError) {
      return adminJson({ error: error.message }, { status: error.status });
    }
    if (error instanceof UserNotFoundError) {
      return adminJson({ error: 'The trader on this deposit no longer exists.' }, { status: 404 });
    }
    throw error;
  }
}
