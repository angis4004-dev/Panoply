import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { connectToDatabase } from '@/lib/mongo';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
import { NetworkModel } from '@/lib/models/Network';

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

  /*
   * The catalog supplies the display name and the warning copy. Looked up in
   * one query keyed by the networks actually in use rather than per row, and
   * a network with no catalog entry still lists - the address predates the
   * catalog and withholding it would stop a trader depositing over a
   * cosmetic gap.
   */
  const networks = await NetworkModel.find({
    key: { $in: [...new Set(addresses.map((entry) => entry.network))] },
  })
    .select('key name description depositEnabled memoRequired')
    .lean();
  const byKey = new Map(networks.map((network) => [network.key, network]));

  return NextResponse.json(
    addresses
      // A chain with deposits switched off is not a place to send money. The
      // address row stays active because funds may still arrive at it; what
      // stops here is telling anyone else to use it.
      .filter((entry) => byKey.get(entry.network)?.depositEnabled !== false)
      .map((entry) => {
        const network = byKey.get(entry.network);
        return {
          id: entry._id.toString(),
          coin: entry.coin,
          network: entry.network,
          networkName: network?.name ?? entry.network,
          networkDescription: network?.description ?? '',
          memoRequired: network?.memoRequired ?? false,
          address: entry.address,
          memoTag: entry.memoTag || null,
        };
      })
  );
}
