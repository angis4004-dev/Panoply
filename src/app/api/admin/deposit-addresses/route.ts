import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { depositAddressCreateSchema } from '@/lib/admin/validation';
import { parseBody } from '@/lib/validation';
import { broadcastToTraders } from '@/lib/notifications';
import {
  checkAddressForNetwork,
  checkMemoForNetwork,
  findActiveNetwork,
} from '@/lib/admin/networks';

/**
 * The platform's published deposit addresses.
 *
 * One address per coin and network, shown to every trader. The address itself
 * comes from the operator - it belongs to a custody wallet, and the platform
 * does not generate them. What these endpoints own is the publication: which
 * address traders are told to use, and the audit entry saying who decided that.
 */

function serialize(entry: Record<string, unknown>) {
  return {
    id: String(entry._id),
    scope: (entry.scope as string) ?? 'platform',
    coin: entry.coin as string,
    network: entry.network as string,
    address: entry.address as string,
    memoTag: (entry.memoTag as string) || null,
    label: (entry.label as string) || '',
    status: entry.status as string,
    createdAt: entry.createdAt as Date,
    deactivatedAt: (entry.deactivatedAt as Date | null) ?? null,
    deactivationReason: (entry.deactivationReason as string) || '',
    replacesAddressId: entry.replacesAddressId ? String(entry.replacesAddressId) : null,
    replacedByAddressId: entry.replacedByAddressId ? String(entry.replacedByAddressId) : null,
  };
}

export async function GET(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'deposit_address.read');
  if (!guard.ok) return guard.response;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const params = request.nextUrl.searchParams;
  const status = params.get('status');
  const scope = params.get('scope');

  const query: Record<string, unknown> = {};
  if (status === 'active' || status === 'inactive') query.status = status;
  // Legacy per-trader rows are excluded unless asked for. They are history, and
  // mixing them into the default view suggests they are still deposit targets.
  query.scope =
    scope === 'trader' ? 'trader' : scope === 'all' ? { $in: ['platform', 'trader'] } : 'platform';

  const entries = await DepositAddressModel.find(query)
    .sort({ status: 1, coin: 1, network: 1, createdAt: -1 })
    .limit(300)
    .lean();

  return adminJson({
    addresses: entries.map((entry) => serialize(entry as unknown as Record<string, unknown>)),
  });
}

/**
 * Publish a deposit address.
 *
 * Takes effect for every trader the moment it is written, which is why it is
 * gated on deposit_address.manage and audited with the address as the
 * reference: this is the single value that decides where the platform's
 * inbound funds land.
 */
export async function POST(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'deposit_address.manage');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { data: body, error: invalid } = await parseBody(request, depositAddressCreateSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  /*
   * The network must exist in the catalog, and the address must satisfy its
   * rule. This is the check that stops the platform publishing an Ethereum
   * address as its Tron deposit target - traders would send TRC-20 USDT to it
   * and the funds would be unrecoverable, with the platform on the hook for
   * every one of them.
   */
  const network = await findActiveNetwork(body.network);
  if (!network) {
    return adminJson(
      { error: `${body.network} is not an active network. Add it to the catalog first.` },
      { status: 400 }
    );
  }
  if (!network.depositEnabled) {
    return adminJson(
      {
        error: `Deposits are switched off for ${network.name}. Enable them before publishing an address.`,
      },
      { status: 409 }
    );
  }
  if (network.coins.length > 0 && !network.coins.includes(body.coin)) {
    return adminJson(
      {
        error: `${network.name} is not configured to carry ${body.coin}. Add the coin to the network first.`,
      },
      { status: 400 }
    );
  }
  const addressComplaint = checkAddressForNetwork(network, body.address);
  if (addressComplaint) return adminJson({ error: addressComplaint }, { status: 400 });

  const memoComplaint = checkMemoForNetwork(network, body.memoTag);
  if (memoComplaint) return adminJson({ error: memoComplaint }, { status: 400 });

  try {
    const entry = await DepositAddressModel.create({
      scope: 'platform',
      userId: null,
      coin: body.coin,
      network: body.network,
      address: body.address,
      memoTag: body.memoTag,
      label: body.label ?? '',
      status: 'active',
      assignedByAdminId: ctx.admin.id,
    });

    await recordAdminAction(ctx, {
      action: 'deposit_address.publish',
      targetType: 'deposit_address',
      targetId: entry._id.toString(),
      after: {
        scope: 'platform',
        coin: entry.coin,
        network: entry.network,
        address: entry.address,
        memoTag: entry.memoTag || null,
        status: 'active',
      },
      reference: entry.address,
      reason: 'Deposit address published to all traders.',
    });

    await broadcastToTraders({
      type: 'wallet',
      title: `${entry.coin} deposits are open`,
      body: `You can now deposit ${entry.coin} on ${entry.network}. The address is on your dashboard.`,
      href: '/dashboard',
      dedupeKey: `deposit-address-publish:${entry._id.toString()}`,
    });

    return adminJson(
      { address: serialize(entry.toObject() as unknown as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && (error as Error & { code?: number }).code === 11000) {
      // Either this exact address already exists on the network, or an active
      // address for the coin/network pair already does. Both mean the same
      // thing to the operator: rotate the existing one rather than add a second.
      return adminJson(
        {
          error:
            'An address for that coin and network is already published, or this address is already on file. Rotate the existing one instead.',
        },
        { status: 409 }
      );
    }
    throw error;
  }
}
