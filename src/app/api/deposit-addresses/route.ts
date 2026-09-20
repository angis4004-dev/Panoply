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

  const activeNetworks = await NetworkModel.find({
    status: 'active',
    depositEnabled: true,
    coins: { $elemMatch: { $exists: true } },
  })
    .select('key name description memoRequired coins')
    .sort({ sortOrder: 1, key: 1 })
    .lean();

  /*
   * The catalog supplies the display name and the warning copy. Looked up in
   * one query keyed by the networks actually in use rather than per row, and
   * a network with no catalog entry still lists - the address predates the
   * catalog and withholding it would stop a trader depositing over a
   * cosmetic gap.
   */
  const networks = await NetworkModel.find({
    key: {
      $in: [
        ...new Set([
          ...addresses.map((entry) => entry.network),
          ...activeNetworks.map((network) => network.key),
        ]),
      ],
    },
  })
    .select('key name description depositEnabled memoRequired')
    .lean();
  const byKey = new Map(networks.map((network) => [network.key, network]));

  const byPair = new Map(addresses.map((entry) => [`${entry.coin}\0${entry.network}`, entry]));
  const findDepositAddress = (coin: string, network: string) =>
    byPair.get(`${coin}\0${network}`) ?? null;

  const configuredPairs = activeNetworks.flatMap((network) =>
    network.coins.map((coin) => {
      const entry = findDepositAddress(coin, network.key);
      return {
        entry,
        coin,
        network: network.key,
        unavailableId: `unavailable:${coin}:${network.key}`,
      };
    })
  );

  const configuredIds = new Set(
    configuredPairs.filter((pair) => pair.entry).map((pair) => String(pair.entry?._id))
  );

  const rows = [
    ...configuredPairs.map(({ entry, coin, network, unavailableId }) => ({
      entry,
      coin,
      network,
      unavailableId,
    })),
    ...addresses
      .filter((entry) => !configuredIds.has(String(entry._id)))
      .map((entry) => ({ entry, coin: entry.coin, network: entry.network, unavailableId: null })),
  ];

  return NextResponse.json(
    rows
      .filter(({ network }) => byKey.get(network)?.depositEnabled !== false)
      .map(({ entry, coin, network: networkKey, unavailableId }) => {
        const network = byKey.get(networkKey);
        return {
          id: entry?._id.toString() ?? unavailableId,
          coin,
          network: networkKey,
          networkName: network?.name ?? networkKey,
          networkDescription: network?.description ?? '',
          memoRequired: network?.memoRequired ?? false,
          address: entry?.address ?? null,
          memoTag: entry?.memoTag || null,
        };
      })
  );
}
