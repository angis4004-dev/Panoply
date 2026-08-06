import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { recalculateTier } from '@/lib/achievements/engine';
import { credit, getBalanceMinor, UserNotFoundError } from '@/lib/ledger';
import { InvalidAmountError, toDollars, toPositiveMinor } from '@/lib/money';
import { depositSchema, parseBody } from '@/lib/validation';

// GET /api/wallet - Returns the current user's wallet balance
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  try {
    return NextResponse.json({ balance: toDollars(await getBalanceMinor(session.user.id)) });
  } catch (error) {
    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    throw error;
  }
}

// POST /api/wallet - Deposit funds into the current user's wallet balance
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: body, error: invalid } = await parseBody(request, depositSchema);
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

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const user = await userModel.findById(session.user.id).select('kycStatus').lean();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (user.kycStatus !== 'verified') {
    return NextResponse.json(
      { error: 'Complete identity verification before depositing funds.' },
      { status: 403 }
    );
  }

  // A client that retries a timed-out deposit must not be charged twice. With
  // the header present the retry resolves to the original entry; without it we
  // fall back to prior behaviour, so existing callers are unaffected.
  // Namespaced per operation so one client-generated key reused across
  // endpoints cannot collide on the ledger's unique index.
  const headerKey = request.headers.get('idempotency-key');
  const idempotencyKey = headerKey ? `deposit:${headerKey}` : undefined;

  const result = await credit({
    userId: session.user.id,
    type: 'deposit',
    amountMinor,
    idempotencyKey,
    // lifetimeDeposited feeds computeTier and is incremented in the same
    // transaction as the deposit, so a tier can never reflect money the ledger
    // does not show. Kept in dollars: it is a threshold input, not a balance.
    alsoIncrement: { lifetimeDeposited: toDollars(amountMinor) },
  });

  await recalculateTier(session.user.id);

  return NextResponse.json({ balance: toDollars(result.balanceMinor) });
}
