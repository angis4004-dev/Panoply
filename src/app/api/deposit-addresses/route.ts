import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { connectToDatabase } from '@/lib/mongo';
import { DepositAddressModel } from '@/lib/models/DepositAddress';

/**
 * The deposit addresses a trader may send to.
 *
 * These are the platform's published addresses, the same list for everybody.
 * Retired per-trader rows are excluded by the scope filter: they are history,
 * and showing one would invite a transfer into a wallet nobody is watching.
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

  const addresses = await DepositAddressModel.find({
    scope: 'platform',
    status: 'active',
  })
    .sort({ coin: 1, network: 1 })
    .lean();

  return NextResponse.json(
    addresses.map((entry) => ({
      id: entry._id.toString(),
      coin: entry.coin,
      network: entry.network,
      address: entry.address,
      memoTag: entry.memoTag || null,
    }))
  );
}
