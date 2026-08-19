import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { connectToDatabase } from '@/lib/mongo';
import { PayoutAddressModel } from '@/lib/models/PayoutAddress';
import { WithdrawalModel } from '@/lib/models/Withdrawal';
import { objectId, parseBody, payoutAddressActionSchema } from '@/lib/validation';

/**
 * Remove or relabel a saved payout wallet.
 *
 * There is no edit-the-address operation. An address a withdrawal has already
 * been requested against cannot be changed underneath it, and "change this
 * address" is indistinguishable from "redirect my pending payout" at the point
 * an attacker with a session is asking. Replacing a wallet is deactivate then
 * add, which leaves both rows in the history.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid address id' }, { status: 400 });
  }

  const { data: body, error: invalid } = await parseBody(request, payoutAddressActionSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  // Scoped to the session's own user. Without this the id alone is authority
  // to deactivate somebody else's payout address.
  const existing = await PayoutAddressModel.findOne({
    _id: id,
    userId: session.user.id,
    status: 'active',
  });
  if (!existing) return NextResponse.json({ error: 'Address not found' }, { status: 404 });

  if (body.action === 'relabel') {
    existing.label = body.label;
    await existing.save();
    return NextResponse.json({ address: { id, label: existing.label } });
  }

  /*
   * A payout already in the queue names this address. Removing it now would
   * leave an operator holding a request whose destination has been retired,
   * and the obvious recovery - look up the trader's current address - is
   * exactly the substitution the snapshot exists to prevent.
   */
  const live = await WithdrawalModel.countDocuments({
    payoutAddressId: existing._id,
    status: { $in: ['pending', 'approved'] },
  });
  if (live > 0) {
    return NextResponse.json(
      {
        error:
          'A withdrawal to this address is still being processed. You can remove it once that has been paid.',
      },
      { status: 409 }
    );
  }

  existing.status = 'inactive';
  existing.deactivatedAt = new Date();
  await existing.save();

  return NextResponse.json({ address: { id, status: 'inactive' } });
}
