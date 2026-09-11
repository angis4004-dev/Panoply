import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { connectToDatabase } from '@/lib/mongo';
import { DepositModel } from '@/lib/models/Deposit';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
import { UserModel } from '@/lib/models/user';
import { traderDepositClaimSchema } from '@/lib/admin/validation';
import { parseBody } from '@/lib/validation';
import { consumeAttempt, formatRetryAfter } from '@/lib/rate-limit';
import { alertOps } from '@/lib/ops-alerts';

/**
 * The trader's own deposits.
 *
 * A trader can declare a transfer they have sent and watch it sit in `pending`
 * until an operator confirms it. What they cannot do is influence the outcome:
 * the amount credited is set during review, not taken from this body, and
 * `status` is not a field this endpoint accepts.
 *
 * Every query is scoped to the session's own user id, with no id parameter to
 * tamper with.
 */

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const deposits = await DepositModel.find({ userId: session.user.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return NextResponse.json(
    deposits.map((deposit) => ({
      id: String(deposit._id),
      coin: deposit.coin,
      network: deposit.network,
      // The address as it stood when the claim was made. Read from the
      // deposit's own snapshot, not the address row, which may since have
      // rotated - "where did I send it" has to keep answering the same thing.
      address: deposit.address,
      memoTag: deposit.memoTag || null,
      assetAmount: deposit.assetAmount,
      // Only meaningful once approved, and only ever the reviewed figure.
      creditAmountMinor: deposit.status === 'approved' ? (deposit.creditAmountMinor ?? null) : null,
      txReference: deposit.txReference,
      status: deposit.status,
      rejectionReason: deposit.rejectionReason || null,
      createdAt: deposit.createdAt,
      reviewedAt: deposit.reviewedAt ?? null,
    }))
  );
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  // A claim is cheap to submit and produces a queue item a human has to read.
  // Ten an hour is far past any honest use and stops one account burying the
  // authorization queue.
  const limit = await consumeAttempt(`deposit-claim:${session.user.id}`, 10, 60 * 60 * 1000);
  if (limit.limited) {
    return NextResponse.json(
      {
        error: `Too many deposit notifications. Try again in ${formatRetryAfter(limit.retryAfterMs)}.`,
      },
      { status: 429 }
    );
  }

  const { data: body, error: invalid } = await parseBody(request, traderDepositClaimSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  // The same gate the retired POST /api/wallet enforced. Declaring a transfer
  // is the first step of being credited, so it carries the same requirement.
  const user = await UserModel.findById(session.user.id).select('kycStatus').lean();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.kycStatus !== 'verified') {
    return NextResponse.json(
      { error: 'Complete identity verification before depositing funds.' },
      { status: 403 }
    );
  }

  // The address must be one the platform currently publishes. Addresses are
  // shared, so there is no owner to check - what matters is that the trader
  // cannot claim against a retired row or a per-trader address from the old
  // model, either of which names a wallet no operator is reconciling.
  const address = await DepositAddressModel.findOne({
    _id: body.depositAddressId,
    scope: 'platform',
  }).lean();
  if (!address) {
    return NextResponse.json({ error: 'Unknown deposit address.' }, { status: 404 });
  }
  if (address.status !== 'active') {
    return NextResponse.json(
      { error: 'That deposit address is no longer in use. Contact support.' },
      { status: 409 }
    );
  }

  try {
    const deposit = await DepositModel.create({
      userId: session.user.id,
      depositAddressId: address._id,
      coin: address.coin,
      network: address.network,
      address: address.address,
      memoTag: address.memoTag,
      assetAmount: body.assetAmount,
      txReference: body.txReference,
      status: 'pending',
      source: 'trader',
    });

    void alertOps({
      type: 'deposit',
      userId: session.user.id,
      email: session.user.email,
      amount: String(deposit.assetAmount),
      coin: deposit.coin,
      network: deposit.network,
      txReference: deposit.txReference,
    });

    return NextResponse.json(
      {
        id: String(deposit._id),
        status: deposit.status,
        coin: deposit.coin,
        network: deposit.network,
        assetAmount: deposit.assetAmount,
        createdAt: deposit.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && (error as Error & { code?: number }).code === 11000) {
      return NextResponse.json(
        { error: 'That transaction has already been submitted.' },
        { status: 409 }
      );
    }
    throw error;
  }
}
