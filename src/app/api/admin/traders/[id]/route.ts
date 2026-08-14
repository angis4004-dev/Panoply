import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { DepositModel } from '@/lib/models/Deposit';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
import { LedgerEntryModel } from '@/lib/models/LedgerEntry';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { traderUpdateSchema } from '@/lib/admin/validation';
import { objectId, parseBody } from '@/lib/validation';
import { hasPermission } from '@/lib/admin/permissions';
import { revokeUserSessions } from '@/lib/session';

/**
 * One trader, with the history an operator needs to answer a question about
 * them: their addresses, their deposits, their ledger, and what admins have
 * done to the account.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'trader.read');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid trader id' }, { status: 400 });
  }

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const user = await UserModel.findOne({ _id: id, role: 'Trader' })
    .select(
      'name email status kycStatus kycSubmittedAt riskProfile walletBalanceMinor lifetimeDeposited createdAt lastActiveDate notes tier'
    )
    .lean();
  if (!user) return adminJson({ error: 'Trader not found' }, { status: 404 });

  const [addresses, deposits, ledger, actions] = await Promise.all([
    hasPermission(ctx.admin, 'deposit_address.read')
      ? DepositAddressModel.find({ userId: id }).sort({ createdAt: -1 }).lean()
      : Promise.resolve([]),
    hasPermission(ctx.admin, 'deposit.read')
      ? DepositModel.find({ userId: id }).sort({ createdAt: -1 }).limit(50).lean()
      : Promise.resolve([]),
    LedgerEntryModel.find({ userId: id }).sort({ createdAt: -1 }).limit(50).lean(),
    hasPermission(ctx.admin, 'audit.read')
      ? AdminAuditLogModel.find({ affectedUserId: id }).sort({ createdAt: -1 }).limit(50).lean()
      : Promise.resolve([]),
  ]);

  return adminJson({
    trader: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      status: user.status ?? 'active',
      kycStatus: user.kycStatus ?? 'unverified',
      kycSubmittedAt: user.kycSubmittedAt ?? null,
      riskProfile: user.riskProfile ?? 'Balanced',
      walletBalanceMinor: user.walletBalanceMinor ?? 0,
      lifetimeDeposited: user.lifetimeDeposited ?? 0,
      tier: user.tier ?? 'unverified',
      createdAt: user.createdAt,
      lastActiveDate: user.lastActiveDate ?? null,
      notes: user.notes ?? '',
    },
    depositAddresses: addresses.map((entry) => ({
      id: String(entry._id),
      coin: entry.coin,
      network: entry.network,
      address: entry.address,
      memoTag: entry.memoTag ?? null,
      label: entry.label ?? '',
      status: entry.status,
      createdAt: entry.createdAt,
      deactivatedAt: entry.deactivatedAt ?? null,
      deactivationReason: entry.deactivationReason ?? '',
      replacedByAddressId: entry.replacedByAddressId ? String(entry.replacedByAddressId) : null,
    })),
    deposits: deposits.map((entry) => ({
      id: String(entry._id),
      coin: entry.coin,
      network: entry.network,
      assetAmount: entry.assetAmount,
      creditAmountMinor: entry.creditAmountMinor ?? null,
      txReference: entry.txReference,
      status: entry.status,
      createdAt: entry.createdAt,
      reviewedAt: entry.reviewedAt ?? null,
      rejectionReason: entry.rejectionReason ?? '',
    })),
    ledger: ledger.map((entry) => ({
      id: String(entry._id),
      type: entry.type,
      amountMinor: entry.amountMinor,
      balanceAfterMinor: entry.balanceAfterMinor,
      memo: entry.memo ?? '',
      createdAt: entry.createdAt,
    })),
    accountHistory: actions.map((entry) => ({
      id: String(entry._id),
      actorEmail: entry.actorEmail,
      actorRole: entry.actorRole ?? '',
      action: entry.action,
      reason: entry.reason ?? '',
      reference: entry.reference ?? '',
      before: entry.before,
      after: entry.after,
      createdAt: entry.createdAt,
    })),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'trader.update');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid trader id' }, { status: 400 });
  }

  const { data: body, error: invalid } = await parseBody(request, traderUpdateSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  // Suspension is its own permission. Editing a risk profile and cutting off
  // someone's access are not the same authority, and trader.update should not
  // silently include the second.
  if (body.status !== undefined && !hasPermission(ctx.admin, 'trader.suspend')) {
    return adminJson(
      { error: 'This action requires the trader.suspend permission.' },
      { status: 403 }
    );
  }

  const before = await UserModel.findOne({ _id: id, role: 'Trader' })
    .select('name status riskProfile notes')
    .lean();
  if (!before) return adminJson({ error: 'Trader not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.riskProfile !== undefined) updates.riskProfile = body.riskProfile;
  if (body.status !== undefined) updates.status = body.status;
  if (body.notes !== undefined) updates.notes = body.notes;

  const updated = await UserModel.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  )
    .select('name email status riskProfile notes walletBalanceMinor kycStatus')
    .lean();
  if (!updated) return adminJson({ error: 'Trader not found' }, { status: 404 });

  // A suspended trader must lose access now, not when their cookie expires.
  // getSessionFromRequest already refuses a suspended account, but bumping
  // tokenVersion means it is refused by two independent mechanisms.
  if (body.status === 'suspended') {
    await revokeUserSessions(id);
  }

  await recordAdminAction(ctx, {
    action: body.status !== undefined ? 'trader.status_change' : 'trader.update',
    targetType: 'user',
    targetId: id,
    affectedUserId: id,
    before: before as unknown as Record<string, unknown>,
    after: updates,
    reason: body.reason ?? '',
  });

  return adminJson({
    trader: {
      id: String(updated._id),
      name: updated.name,
      email: updated.email,
      status: updated.status ?? 'active',
      riskProfile: updated.riskProfile ?? 'Balanced',
      notes: updated.notes ?? '',
      kycStatus: updated.kycStatus ?? 'unverified',
      walletBalanceMinor: updated.walletBalanceMinor ?? 0,
    },
  });
}
