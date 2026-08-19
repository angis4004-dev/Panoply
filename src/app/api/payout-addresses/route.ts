import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { connectToDatabase } from '@/lib/mongo';
import { PayoutAddressModel } from '@/lib/models/PayoutAddress';
import { NetworkModel } from '@/lib/models/Network';
import { payoutAddressCreateSchema, parseBody } from '@/lib/validation';
import { checkAddressForNetwork, checkMemoForNetwork } from '@/lib/admin/networks';
import { guessAddressFamilies, ADDRESS_FAMILY_LABELS } from '@/lib/crypto-address';

/**
 * A trader's saved payout wallets, one per network and coin.
 *
 * See src/lib/models/PayoutAddress.ts for why these are per-chain rather than
 * the single walletAddress they replace.
 */

function serialize(entry: Record<string, unknown>) {
  return {
    id: String(entry._id),
    networkKey: entry.networkKey as string,
    coin: entry.coin as string,
    address: entry.address as string,
    memoTag: (entry.memoTag as string) || null,
    label: (entry.label as string) || '',
    confirmedAt: (entry.confirmedAt as Date | null) ?? null,
    lastUsedAt: (entry.lastUsedAt as Date | null) ?? null,
    createdAt: entry.createdAt as Date,
  };
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const entries = await PayoutAddressModel.find({
    userId: session.user.id,
    status: 'active',
  })
    .sort({ networkKey: 1, coin: 1 })
    .lean();

  return NextResponse.json({
    addresses: entries.map((entry) => serialize(entry as unknown as Record<string, unknown>)),
  });
}

/**
 * Save a payout wallet.
 *
 * The address is checked against the chosen network's format rule, and a
 * failure that looks like a wrong-chain paste says so specifically - naming
 * what the address appears to be is the difference between a trader fixing it
 * themselves and a support ticket.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  const { data: body, error: invalid } = await parseBody(request, payoutAddressCreateSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const network = await NetworkModel.findOne({ key: body.networkKey, status: 'active' }).lean();
  if (!network) {
    return NextResponse.json({ error: 'That network is not available.' }, { status: 400 });
  }
  if (!network.withdrawalEnabled) {
    return NextResponse.json(
      { error: `Withdrawals on ${network.name} are temporarily unavailable.` },
      { status: 409 }
    );
  }
  if (network.coins.length > 0 && !network.coins.includes(body.coin)) {
    return NextResponse.json(
      { error: `${network.name} does not carry ${body.coin}.` },
      { status: 400 }
    );
  }

  const addressComplaint = checkAddressForNetwork(network, body.address);
  if (addressComplaint) {
    /*
     * If the address is well-formed for some *other* chain, say which. A
     * trader who has pasted their Ethereum address into the Tron field is
     * reading a message about prefixes and lengths; telling them what they
     * actually pasted is what makes the mistake obvious.
     */
    const looksLike = guessAddressFamilies(body.address).filter(
      (family) => family !== network.addressFamily
    );
    const hint =
      looksLike.length > 0
        ? ` That looks like ${looksLike.map((f) => ADDRESS_FAMILY_LABELS[f].split(' (')[0]).join(' or ')} address.`
        : '';
    return NextResponse.json({ error: `${addressComplaint}${hint}` }, { status: 400 });
  }

  const memoComplaint = checkMemoForNetwork(network, body.memoTag);
  if (memoComplaint) return NextResponse.json({ error: memoComplaint }, { status: 400 });

  try {
    const entry = await PayoutAddressModel.create({
      userId: session.user.id,
      networkKey: body.networkKey,
      coin: body.coin,
      address: body.address,
      memoTag: body.memoTag ?? '',
      label: body.label ?? '',
      // Saved and confirmed in one step. The schema requires confirmOwnership,
      // so a row can never exist without the assertion having been made.
      confirmedAt: new Date(),
      validatedAgainstFamily: network.addressFamily,
      status: 'active',
    });

    return NextResponse.json(
      { address: serialize(entry.toObject() as unknown as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && (error as Error & { code?: number }).code === 11000) {
      return NextResponse.json(
        {
          error: `You already have a ${body.coin} payout address on ${network.name}. Remove it before adding another.`,
        },
        { status: 409 }
      );
    }
    throw error;
  }
}
