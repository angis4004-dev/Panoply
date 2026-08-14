import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { DepositModel } from '@/lib/models/Deposit';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
import { UserModel } from '@/lib/models/user';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { depositCreateSchema } from '@/lib/admin/validation';
import { objectId, parseBody } from '@/lib/validation';
import { serializeDeposit } from '@/lib/admin/deposits';

/** The deposit authorization queue. */

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'deposit.read');
  if (!guard.ok) return guard.response;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const params = request.nextUrl.searchParams;
  const status = params.get('status') ?? 'pending';
  const userId = params.get('userId');
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const query: Record<string, unknown> = {};
  if (status !== 'all') query.status = status;
  if (userId) {
    if (!objectId.safeParse(userId).success) {
      return adminJson({ error: 'Invalid trader id' }, { status: 400 });
    }
    query.userId = userId;
  }

  const [rows, total, pendingCount] = await Promise.all([
    DepositModel.find(query)
      .populate('userId', 'name email')
      // Pending oldest-first: a queue people work through should not bury the
      // deposit that has been waiting longest under this morning's arrivals.
      .sort(status === 'pending' ? { createdAt: 1 } : { createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    DepositModel.countDocuments(query),
    DepositModel.countDocuments({ status: 'pending' }),
  ]);

  return adminJson({
    deposits: rows.map((row) => serializeDeposit(row as unknown as Record<string, unknown>)),
    page,
    pageSize: PAGE_SIZE,
    total,
    pendingCount,
  });
}

/**
 * Record a deposit on a trader's behalf.
 *
 * For transfers that arrive without the trader declaring them - which is most
 * of them. Creating the row does not credit anything; it enters the queue as
 * pending like any other and still needs an authorization.
 *
 * Gated on deposit.authorize rather than deposit.read: entering a claim
 * against someone else's account is the first half of crediting it, and
 * splitting the two across two people only helps if the first half is also
 * restricted.
 */
export async function POST(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'deposit.authorize');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { data: body, error: invalid } = await parseBody(request, depositCreateSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const [trader, address] = await Promise.all([
    UserModel.findOne({ _id: body.userId, role: 'Trader' }).select('_id').lean(),
    DepositAddressModel.findById(body.depositAddressId).lean(),
  ]);

  if (!trader) return adminJson({ error: 'Trader not found' }, { status: 404 });
  if (!address) return adminJson({ error: 'Deposit address not found' }, { status: 404 });
  if (address.scope !== 'platform') {
    // A retired per-trader address. Recording against one produces a claim
    // pointing at a wallet that is no longer reconciled, which the authorizing
    // admin would have no way to confirm.
    return adminJson(
      { error: 'That address is retired. Record the deposit against a published address.' },
      { status: 409 }
    );
  }

  try {
    const deposit = await DepositModel.create({
      userId: body.userId,
      depositAddressId: address._id,
      coin: address.coin,
      network: address.network,
      address: address.address,
      memoTag: address.memoTag,
      assetAmount: body.assetAmount,
      txReference: body.txReference,
      status: 'pending',
      source: 'admin',
      createdByAdminId: ctx.admin.id,
    });

    await recordAdminAction(ctx, {
      action: 'deposit.record',
      targetType: 'deposit',
      targetId: deposit._id.toString(),
      affectedUserId: body.userId,
      after: {
        status: 'pending',
        coin: deposit.coin,
        network: deposit.network,
        assetAmount: deposit.assetAmount,
      },
      reference: deposit.txReference,
      reason: 'Inbound transfer recorded for authorization.',
    });

    return adminJson(
      { deposit: serializeDeposit(deposit.toObject() as unknown as Record<string, unknown>) },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && (error as Error & { code?: number }).code === 11000) {
      return adminJson(
        { error: 'That transaction reference has already been recorded on this network.' },
        { status: 409 }
      );
    }
    throw error;
  }
}
