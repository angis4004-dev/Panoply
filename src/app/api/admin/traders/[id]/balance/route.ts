import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { balanceAdjustSchema } from '@/lib/admin/validation';
import { objectId, parseBody } from '@/lib/validation';
import { setBalanceToTarget, UserNotFoundError } from '@/lib/ledger';
import { StaleBalanceError } from '@/lib/admin-balance';

/**
 * A manual wallet adjustment.
 *
 * Its own endpoint rather than a field on the trader PATCH, and gated on its
 * own permission. Editing someone's risk profile and altering their balance
 * are not the same act, and the previous design - `walletBalance` as one more
 * key in a general-purpose update body - is what let a correction look like a
 * profile edit in the audit trail.
 *
 * Three things are mandatory and none of them are optional anywhere:
 *
 *   - a reason, because a hand-set balance has no legitimate routine use and
 *     should be impossible to perform without saying why;
 *   - the balance the operator was looking at, so a second adjustment prepared
 *     from a stale screen is rejected rather than applied on top of the first;
 *   - the ledger, which is the only thing that writes walletBalanceMinor.
 *     There is no code path here that touches the field directly.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'ledger.adjust');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid trader id' }, { status: 400 });
  }

  const { data: body, error: invalid } = await parseBody(request, balanceAdjustSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const trader = await UserModel.findOne({ _id: id, role: 'Trader' }).select('_id').lean();
  if (!trader) return adminJson({ error: 'Trader not found' }, { status: 404 });

  try {
    const result = await setBalanceToTarget({
      userId: id,
      type: 'admin_adjustment',
      targetMinor: body.targetBalanceMinor,
      expectedBalanceMinor: body.expectedBalanceMinor,
      actorAdminId: ctx.admin.id,
      memo: body.reason,
      audit: {
        actorAdminId: ctx.admin.id,
        actorEmail: ctx.admin.email,
        actorRole: ctx.admin.role,
        sessionId: ctx.sessionId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        reason: body.reason,
      },
    });

    return adminJson({
      balanceMinor: result.balanceMinor,
      entryId: result.entryId,
      // No entry is posted when the target already equals the current balance.
      // Reported rather than hidden, so the operator is not left wondering why
      // the history has no new row.
      noop: result.entryId === '',
    });
  } catch (error) {
    if (error instanceof StaleBalanceError) {
      return adminJson({ error: error.message }, { status: 409 });
    }
    if (error instanceof UserNotFoundError) {
      return adminJson({ error: 'Trader not found' }, { status: 404 });
    }
    throw error;
  }
}
