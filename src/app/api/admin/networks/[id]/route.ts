import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { NetworkModel } from '@/lib/models/Network';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { networkUpdateSchema } from '@/lib/admin/validation';
import { objectId, parseBody } from '@/lib/validation';
import { blockersToDeactivate, serializeNetwork } from '@/lib/admin/networks';
import { validateAddressRule } from '@/lib/crypto-address';

/**
 * Edit a network.
 *
 * `key` is not editable - it is written into every deposit, payout address and
 * withdrawal that names this chain, and changing it would detach all of that
 * history from the row that explains it. The schema simply has no field for it.
 *
 * Everything else can change, including the address rule, which is why the
 * change is audited with both the before and after state: loosening a rule is
 * how a wrong-chain payout gets through validation, and the log has to show
 * who did it.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'network.manage');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid network id' }, { status: 400 });
  }

  const { data: body, error: invalid } = await parseBody(request, networkUpdateSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const existing = await NetworkModel.findById(id);
  if (!existing) return adminJson({ error: 'Network not found' }, { status: 404 });

  const before = serializeNetwork(existing.toObject() as unknown as Record<string, unknown>);

  /*
   * The address rule is validated against the merged result, not against the
   * patch. A request that switches the family to `custom` without supplying
   * lengths passes the schema's own check - the patch alone looks like a bare
   * family change - and would leave a rule that matches nothing.
   */
  const mergedFamily = body.addressFamily ?? existing.addressFamily;
  const mergedRule = {
    family: mergedFamily,
    prefix: body.addressPrefix ?? existing.addressPrefix ?? undefined,
    charset: body.addressCharset ?? existing.addressCharset ?? undefined,
    minLength: body.addressMinLength ?? existing.addressMinLength ?? undefined,
    maxLength: body.addressMaxLength ?? existing.addressMaxLength ?? undefined,
  };
  const ruleComplaint = validateAddressRule(mergedRule);
  if (ruleComplaint) {
    return adminJson({ error: ruleComplaint }, { status: 400 });
  }

  // Same reasoning for the memo pair: either half can arrive alone.
  const mergedMemoSupported = body.memoSupported ?? existing.memoSupported;
  const mergedMemoRequired = body.memoRequired ?? existing.memoRequired;
  if (mergedMemoRequired && !mergedMemoSupported) {
    return adminJson(
      { error: 'A network cannot require a memo it does not support.' },
      { status: 400 }
    );
  }

  if (body.status === 'inactive' && existing.status === 'active') {
    const blocker = await blockersToDeactivate(existing.key);
    if (blocker) return adminJson({ error: blocker }, { status: 409 });
  }

  if (body.name !== undefined) existing.name = body.name;
  if (body.description !== undefined) existing.description = body.description;
  if (body.addressFamily !== undefined) existing.addressFamily = body.addressFamily;
  if (body.addressPrefix !== undefined) existing.addressPrefix = body.addressPrefix;
  if (body.addressCharset !== undefined) existing.addressCharset = body.addressCharset;
  if (body.addressMinLength !== undefined) existing.addressMinLength = body.addressMinLength;
  if (body.addressMaxLength !== undefined) existing.addressMaxLength = body.addressMaxLength;
  if (body.memoSupported !== undefined) existing.memoSupported = body.memoSupported;
  if (body.memoRequired !== undefined) existing.memoRequired = body.memoRequired;
  if (body.coins !== undefined) existing.coins = body.coins;
  if (body.depositEnabled !== undefined) existing.depositEnabled = body.depositEnabled;
  if (body.withdrawalEnabled !== undefined) existing.withdrawalEnabled = body.withdrawalEnabled;
  if (body.minWithdrawalMinor !== undefined) existing.minWithdrawalMinor = body.minWithdrawalMinor;
  if (body.sortOrder !== undefined) existing.sortOrder = body.sortOrder;
  if (body.status !== undefined) {
    existing.status = body.status;
    existing.deactivatedAt = body.status === 'inactive' ? new Date() : null;
  }
  existing.updatedByAdminId = new mongoose.Types.ObjectId(ctx.admin.id);

  await existing.save();
  const after = serializeNetwork(existing.toObject() as unknown as Record<string, unknown>);

  await recordAdminAction(ctx, {
    action: body.status && body.status !== before.status ? 'network.status' : 'network.update',
    targetType: 'network',
    targetId: existing._id.toString(),
    before: {
      name: before.name,
      addressFamily: before.addressFamily,
      addressPrefix: before.addressPrefix,
      addressMinLength: before.addressMinLength,
      addressMaxLength: before.addressMaxLength,
      depositEnabled: before.depositEnabled,
      withdrawalEnabled: before.withdrawalEnabled,
      status: before.status,
    },
    after: {
      name: after.name,
      addressFamily: after.addressFamily,
      addressPrefix: after.addressPrefix,
      addressMinLength: after.addressMinLength,
      addressMaxLength: after.addressMaxLength,
      depositEnabled: after.depositEnabled,
      withdrawalEnabled: after.withdrawalEnabled,
      status: after.status,
    },
    reference: after.key,
    reason: 'Network configuration changed.',
  });

  return adminJson({ network: after });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireActiveAdmin(request, 'network.manage');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid network id' }, { status: 400 });
  }

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const existing = await NetworkModel.findOne({ _id: id, status: 'inactive' }).lean();
  if (!existing) {
    return adminJson(
      { error: 'Only inactive networks can be permanently deleted.' },
      { status: 409 }
    );
  }

  const deleted = await NetworkModel.deleteOne({ _id: id, status: 'inactive' });
  if (deleted.deletedCount !== 1) {
    return adminJson({ error: 'That network was already deleted.' }, { status: 404 });
  }

  await recordAdminAction(ctx, {
    action: 'network.delete',
    targetType: 'network',
    targetId: id,
    before: {
      key: existing.key,
      name: existing.name,
      status: existing.status,
    },
    after: { status: 'deleted' },
    reference: existing.key,
    reason: 'Inactive network permanently deleted.',
  });

  return adminJson({ network: { id, key: existing.key, status: 'deleted' } });
}
