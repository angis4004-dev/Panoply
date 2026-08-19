import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
import { NetworkModel } from '@/lib/models/Network';
import { checkAddressForNetwork, checkMemoForNetwork } from '@/lib/admin/networks';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { depositAddressActionSchema } from '@/lib/admin/validation';
import { objectId, parseBody } from '@/lib/validation';
import { broadcastToTraders } from '@/lib/notifications';

/**
 * Withdraw or rotate a published address.
 *
 * There is no edit. An address in traders' hands cannot be changed underneath
 * them - funds may already be in flight to it - so the only operations are
 * "stop publishing this one" and "replace it with a new one", both of which
 * leave the original row intact and traceable.
 *
 * Both broadcast. A platform address is on every trader's dashboard, and the
 * people who most need to hear it changed are the ones who saved the old one.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'deposit_address.manage');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid address id' }, { status: 400 });
  }

  const { data: body, error: invalid } = await parseBody(request, depositAddressActionSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const existing = await DepositAddressModel.findById(id).lean();
  if (!existing) return adminJson({ error: 'Deposit address not found' }, { status: 404 });

  // Legacy per-trader rows are read-only. They were retired by the migration
  // and rotating one would publish a replacement platform-wide from a row that
  // never meant that - see scripts/migrate-platform-addresses.mjs.
  if (existing.scope === 'trader') {
    return adminJson(
      { error: 'This is a retired per-trader address, kept for history. It cannot be changed.' },
      { status: 409 }
    );
  }

  if (body.action === 'deactivate') {
    if (existing.status === 'inactive') {
      return adminJson({ error: 'That address is already inactive.' }, { status: 409 });
    }

    const updated = await DepositAddressModel.findOneAndUpdate(
      { _id: id, status: 'active' },
      {
        $set: {
          status: 'inactive',
          deactivatedAt: new Date(),
          deactivatedByAdminId: ctx.admin.id,
          deactivationReason: body.reason,
        },
      },
      { new: true }
    ).lean();
    if (!updated) return adminJson({ error: 'That address is already inactive.' }, { status: 409 });

    await recordAdminAction(ctx, {
      action: 'deposit_address.withdraw',
      targetType: 'deposit_address',
      targetId: id,
      before: { status: 'active', address: existing.address },
      after: { status: 'inactive' },
      reference: existing.address,
      reason: body.reason,
    });

    await broadcastToTraders({
      type: 'wallet',
      title: `${existing.coin} deposit address withdrawn`,
      body: `The ${existing.coin} address on ${existing.network} is no longer in use. Do not send further funds to it.`,
      href: '/dashboard',
      dedupeKey: `deposit-address-withdraw:${id}`,
    });

    return adminJson({ address: { id, status: 'inactive' } });
  }

  // --- Rotation ------------------------------------------------------------

  if (existing.address === body.address) {
    return adminJson(
      { error: 'The replacement address is the same as the current one.' },
      { status: 400 }
    );
  }

  /*
   * The replacement is checked against the same network rule a newly published
   * address goes through. Rotation is the path that would otherwise let an
   * unvalidated address onto a chain: the network is inherited from the row
   * being replaced rather than submitted, so without this the only format
   * check in the system sits on the create route and rotation walks past it.
   *
   * A network that has since been deactivated does not block a rotation. The
   * old address is already published and traders are sending to it; refusing
   * to replace it would leave the worse address in place.
   */
  const network = await NetworkModel.findOne({ key: existing.network }).lean();
  if (network) {
    const addressComplaint = checkAddressForNetwork(network, body.address);
    if (addressComplaint) return adminJson({ error: addressComplaint }, { status: 400 });

    const memoComplaint = checkMemoForNetwork(network, body.memoTag);
    if (memoComplaint) return adminJson({ error: memoComplaint }, { status: 400 });
  }

  // One transaction. A rotation that withdrew the old address and then failed
  // to publish the new one would leave the platform with no address at all for
  // that asset, and the partial unique index means the two writes cannot be
  // reordered to avoid the problem - the old one has to go inactive before the
  // new one can go active.
  const session = await mongoose.startSession();
  try {
    let created: { _id: mongoose.Types.ObjectId } | null = null;

    await session.withTransaction(async () => {
      const deactivated = await DepositAddressModel.findOneAndUpdate(
        { _id: id, status: 'active', scope: 'platform' },
        {
          $set: {
            status: 'inactive',
            deactivatedAt: new Date(),
            deactivatedByAdminId: ctx.admin.id,
            deactivationReason: body.reason,
          },
        },
        { new: true, session }
      );
      if (!deactivated) {
        throw new Error('ADDRESS_NOT_ACTIVE');
      }

      const [next] = await DepositAddressModel.create(
        [
          {
            scope: 'platform',
            userId: null,
            coin: existing.coin,
            network: existing.network,
            address: body.address,
            memoTag: body.memoTag,
            label: body.label ?? existing.label ?? '',
            status: 'active',
            assignedByAdminId: ctx.admin.id,
            replacesAddressId: existing._id,
          },
        ],
        { session }
      );

      await DepositAddressModel.updateOne(
        { _id: existing._id },
        { $set: { replacedByAddressId: next._id } },
        { session }
      );

      created = next;
    });

    const nextId = created ? String((created as { _id: mongoose.Types.ObjectId })._id) : '';

    await recordAdminAction(ctx, {
      action: 'deposit_address.rotate',
      targetType: 'deposit_address',
      targetId: nextId,
      before: { address: existing.address, status: 'active' },
      after: { address: body.address, status: 'active', replacesAddressId: id },
      reference: body.address,
      reason: body.reason,
    });

    await broadcastToTraders({
      type: 'wallet',
      title: `${existing.coin} deposit address changed`,
      body: `The ${existing.coin} deposit address on ${existing.network} has been replaced. Use the new address shown on your dashboard and stop using the old one.`,
      href: '/dashboard',
      dedupeKey: `deposit-address-rotate:${nextId}`,
    });

    return adminJson({ address: { id: nextId, status: 'active', replaces: id } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'ADDRESS_NOT_ACTIVE') {
      return adminJson(
        { error: 'That address is no longer active. Reload and try again.' },
        { status: 409 }
      );
    }
    if (error instanceof Error && (error as Error & { code?: number }).code === 11000) {
      return adminJson(
        { error: 'That address is already published on this network.' },
        { status: 409 }
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
