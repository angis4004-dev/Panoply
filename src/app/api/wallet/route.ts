import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { getUserModel } from '@/lib/models';
import { getBalanceMinor, UserNotFoundError } from '@/lib/ledger';
import { toDollars } from '@/lib/money';

/**
 * The wallet is read-only to its owner.
 *
 * This route used to accept a POST that credited the caller's balance by
 * whatever amount they sent. Nothing arrived on any chain; the number simply
 * went up. Money now enters exactly one way: the trader declares a transfer
 * against a published deposit address (POST /api/deposits), and an admin
 * holding deposit.authorize credits it after matching the transaction against
 * the wallet. That is the only path that produces a ledger entry with evidence
 * behind it, and a second path with none would make the first one pointless.
 */

// GET /api/wallet - Returns the current user's wallet balance
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const locked = requireUnlock(request, session);
  if (locked) return locked;

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
