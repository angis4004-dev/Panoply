import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { connectToDatabase } from '@/lib/mongo';
import { WithdrawalModel } from '@/lib/models/Withdrawal';
import { PayoutAddressModel } from '@/lib/models/PayoutAddress';
import { NetworkModel } from '@/lib/models/Network';
import { validateWithdrawalRequest } from '@/lib/withdrawal-rules';
import { getWithdrawalStanding, serializeWithdrawal } from '@/lib/withdrawals';
import { InvalidAmountError, toDollars, toPositiveMinor } from '@/lib/money';
import { alertOps } from '@/lib/ops-alerts';
import { parseBody, withdrawalCreateSchema } from '@/lib/validation';
import { DEMO_BANNER, isDemoMode } from '@/lib/demo-mode';

/**
 * Taking capital off the platform.
 *
 * Every rule is enforced here, on the server, from database state. The trader's
 * screen reads the same figures from GET and disables what it can, but that is
 * courtesy - a request that arrives with the button bypassed hits exactly the
 * same checks.
 *
 * What this endpoint deliberately cannot do is move money. It records a
 * request. The ledger is debited when an operator approves, in the console -
 * see src/lib/models/Withdrawal.ts for why approval, not payment, is the point
 * at which funds stop being spendable.
 */

/** GET /api/withdrawals - this trader's standing and their request history. */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const standing = await getWithdrawalStanding(session.user.id);
  if (!standing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const [rows, addresses] = await Promise.all([
    WithdrawalModel.find({ userId: session.user.id }).sort({ createdAt: -1 }).limit(50).lean(),
    PayoutAddressModel.find({ userId: session.user.id, status: 'active' })
      .sort({ networkKey: 1, coin: 1 })
      .lean(),
  ]);

  /*
   * The standing reason a request would be refused, so the screen can say it
   * up front instead of the trader discovering it by submitting.
   *
   * Only the checks that do not depend on an amount: identity, wallet
   * ownership, an existing request, and the lock. The amount-sensitive checks
   * are deliberately neutralised with a nominal amount and an unbounded
   * ceiling, because "Enter a valid amount" is a true statement about the
   * empty form and a useless answer to "why can I not withdraw".
   *
   * Having nothing available is reported separately, via withdrawableMinor.
   */
  /*
   * With no saved address there is nothing to confirm yet, and the screen
   * already says so in its own words - see the empty state on the withdraw
   * page. Reporting an ownership blocker here as well would answer "why can I
   * not withdraw" with a step the trader has not reached.
   */
  const addressConfirmed =
    addresses.length === 0 || addresses.some((entry) => Boolean(entry.confirmedAt));

  const blockedReason = validateWithdrawalRequest({
    amountMinor: 1,
    withdrawableMinor: Number.MAX_SAFE_INTEGER,
    kycStatus: standing.kycStatus,
    addressConfirmed,
    hasPendingRequest: standing.hasPendingRequest,
    lock: standing.lock,
  });

  const demo = isDemoMode();

  return NextResponse.json({
    demo,
    /*
     * Says which control was released, not just that this is a demo. An
     * operator reading the screen needs to know the term was lifted and that
     * identity checks were not.
     */
    demoNotice: demo
      ? `${DEMO_BANNER} The committed-term lock is released for this demonstration; identity verification and wallet-ownership checks still apply.`
      : null,
    horizon: standing.horizon,
    horizonLabel: standing.horizonLabel,
    horizonAssumed: standing.horizonAssumed,
    lock: {
      reason: standing.lock.reason,
      awaiting: standing.lock.awaiting,
      clockStartsAt: standing.lock.clockStartsAt,
      unlocksAt: standing.lock.unlocksAt,
      withdrawable: standing.lock.withdrawable,
    },
    balanceMinor: standing.balanceMinor,
    pendingMinor: standing.pendingMinor,
    withdrawableMinor: standing.withdrawableMinor,
    kycStatus: standing.kycStatus,
    walletOwnershipConfirmed: standing.walletOwnershipConfirmed,
    /** Null when nothing structural stands in the way of a request. */
    blockedReason,
    payoutAddresses: addresses.map((entry) => ({
      id: String(entry._id),
      networkKey: entry.networkKey,
      coin: entry.coin,
      address: entry.address,
      memoTag: entry.memoTag || null,
      label: entry.label || '',
    })),
    withdrawals: rows.map((row) => serializeWithdrawal(row as unknown as Record<string, unknown>)),
  });
}

/** POST /api/withdrawals - file a request. */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  const { data: body, error: invalid } = await parseBody(request, withdrawalCreateSchema);
  if (invalid) return invalid;

  let amountMinor: number;
  try {
    amountMinor = toPositiveMinor(body.amount);
  } catch (error) {
    if (error instanceof InvalidAmountError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  /*
   * The destination comes from a row the trader already saved and confirmed,
   * looked up by id and scoped to their own userId. Never from the request
   * body - see withdrawalCreateSchema.
   */
  const payout = await PayoutAddressModel.findOne({
    _id: body.payoutAddressId,
    userId: session.user.id,
    status: 'active',
  }).lean();

  if (!payout) {
    return NextResponse.json(
      { error: 'That payout address is not available. Save one before withdrawing.' },
      { status: 400 }
    );
  }

  const network = await NetworkModel.findOne({ key: payout.networkKey, status: 'active' }).lean();
  if (!network) {
    return NextResponse.json(
      { error: `${payout.networkKey} is no longer available for withdrawals.` },
      { status: 409 }
    );
  }
  if (!network.withdrawalEnabled) {
    return NextResponse.json(
      { error: `Withdrawals on ${network.name} are temporarily unavailable.` },
      { status: 409 }
    );
  }

  const standing = await getWithdrawalStanding(session.user.id);
  if (!standing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const complaint = validateWithdrawalRequest({
    amountMinor,
    withdrawableMinor: standing.withdrawableMinor,
    kycStatus: standing.kycStatus,
    // The specific destination named by this request, not "any address" - a
    // trader with one confirmed wallet must not be able to pay out to a
    // second, unconfirmed one.
    addressConfirmed: Boolean(payout.confirmedAt),
    hasPendingRequest: standing.hasPendingRequest,
    lock: standing.lock,
    networkMinimumMinor: network.minWithdrawalMinor ?? null,
    networkName: network.name,
  });

  if (complaint) return NextResponse.json({ error: complaint }, { status: 400 });

  try {
    const row = await WithdrawalModel.create({
      userId: session.user.id,
      amountMinor,
      networkKey: payout.networkKey,
      coin: payout.coin,
      payoutAddressId: payout._id,
      // Snapshotted, not referenced. Editing the saved address afterwards must
      // not redirect a request already in the queue.
      destinationAddress: payout.address,
      destinationMemo: payout.memoTag || '',
      horizonAtRequest: standing.horizon,
      unlockedAt: standing.lock.unlocksAt,
      status: 'pending',
    });

    void alertOps({
      type: 'withdrawal',
      userId: session.user.id,
      email: session.user.email,
      amountUsd: toDollars(amountMinor),
      coin: payout.coin,
      network: network.name || payout.networkKey,
      destination: payout.address,
    });

    return NextResponse.json(
      { withdrawal: serializeWithdrawal(row.toObject() as unknown as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (error) {
    /*
     * The partial unique index on (userId, status in pending|approved) firing.
     * Two requests submitted together both pass the check above; this is where
     * the second one is stopped.
     */
    if (error instanceof Error && (error as Error & { code?: number }).code === 11000) {
      return NextResponse.json(
        { error: 'You already have a withdrawal awaiting review.' },
        { status: 409 }
      );
    }
    throw error;
  }
}
