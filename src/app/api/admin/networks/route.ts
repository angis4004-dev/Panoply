import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { NetworkModel } from '@/lib/models/Network';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { networkCreateSchema } from '@/lib/admin/validation';
import { parseBody } from '@/lib/validation';
import { serializeNetwork } from '@/lib/admin/networks';

/**
 * The chain catalog.
 *
 * What the platform will move money on, and what a valid address looks like on
 * each chain. Owned by the operator rather than by the code so a new chain
 * does not need a deploy - see src/lib/models/Network.ts for why the rows are
 * never deleted.
 */

export async function GET(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'network.read');
  if (!guard.ok) return guard.response;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const status = request.nextUrl.searchParams.get('status');
  const query: Record<string, unknown> = {};
  if (status === 'active' || status === 'inactive') query.status = status;

  const entries = await NetworkModel.find(query)
    .sort({ status: 1, sortOrder: 1, key: 1 })
    .limit(200)
    .lean();

  return adminJson({
    networks: entries.map((entry) => serializeNetwork(entry as unknown as Record<string, unknown>)),
  });
}

/**
 * Add a chain.
 *
 * Gated on network.manage rather than deposit_address.manage: this decides
 * what counts as a valid address, and a loosened rule lets a wrong-chain
 * payout through validation that would otherwise have caught it.
 */
export async function POST(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'network.manage');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { data: body, error: invalid } = await parseBody(request, networkCreateSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  try {
    const entry = await NetworkModel.create({
      key: body.key,
      name: body.name,
      description: body.description ?? '',
      addressFamily: body.addressFamily,
      addressPrefix: body.addressPrefix ?? '',
      addressCharset: body.addressCharset ?? 'alphanumeric',
      addressMinLength: body.addressMinLength ?? null,
      addressMaxLength: body.addressMaxLength ?? null,
      memoSupported: body.memoSupported,
      memoRequired: body.memoRequired,
      coins: body.coins,
      depositEnabled: body.depositEnabled,
      withdrawalEnabled: body.withdrawalEnabled,
      minWithdrawalMinor: body.minWithdrawalMinor,
      sortOrder: body.sortOrder,
      status: 'active',
      createdByAdminId: ctx.admin.id,
    });

    const serialized = serializeNetwork(entry.toObject() as unknown as Record<string, unknown>);

    await recordAdminAction(ctx, {
      action: 'network.create',
      targetType: 'network',
      targetId: entry._id.toString(),
      after: {
        key: serialized.key,
        name: serialized.name,
        addressFamily: serialized.addressFamily,
        depositEnabled: serialized.depositEnabled,
        withdrawalEnabled: serialized.withdrawalEnabled,
      },
      reference: serialized.key,
      reason: 'Network added to the catalog.',
    });

    return adminJson({ network: serialized }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error as Error & { code?: number }).code === 11000) {
      return adminJson(
        {
          error:
            'A network with that key already exists. Edit the existing one rather than adding a second.',
        },
        { status: 409 }
      );
    }
    throw error;
  }
}
