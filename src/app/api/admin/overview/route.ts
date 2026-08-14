import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { DepositModel } from '@/lib/models/Deposit';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { AdminUserModel } from '@/lib/models/AdminUser';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { hasPermission } from '@/lib/admin/permissions';

/**
 * The console's landing figures.
 *
 * Counts only - no documents, no PII. Everything here is a countDocuments
 * against an indexed field, run in parallel, so the first screen after sign-in
 * does not depend on a scan of the users collection.
 *
 * The recent-activity list is filtered by permission: an admin without
 * audit.read gets the counts and an empty activity feed rather than a 403 on
 * the whole page, because the counts are not what audit.read protects.
 */
export async function GET(request: NextRequest) {
  const guard = await requireActiveAdmin(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const canReadAudit = hasPermission(ctx.admin, 'audit.read');

  const [
    totalTraders,
    activeTraders,
    pendingKyc,
    assignedAddresses,
    pendingDeposits,
    adminCount,
    recent,
  ] = await Promise.all([
    UserModel.countDocuments({ role: 'Trader' }),
    UserModel.countDocuments({ role: 'Trader', status: 'active' }),
    UserModel.countDocuments({ kycStatus: 'pending' }),
    DepositAddressModel.countDocuments({ status: 'active' }),
    DepositModel.countDocuments({ status: 'pending' }),
    AdminUserModel.countDocuments({ status: 'active' }),
    canReadAudit
      ? AdminAuditLogModel.find({})
          .sort({ createdAt: -1 })
          .limit(15)
          .select('actorEmail actorRole action targetType targetId reason createdAt')
          .lean()
      : Promise.resolve([]),
  ]);

  return adminJson({
    counts: {
      totalTraders,
      activeTraders,
      pendingKyc,
      assignedAddresses,
      pendingDeposits,
      admins: adminCount,
    },
    recentActions: recent.map((entry) => ({
      id: String(entry._id),
      actorEmail: entry.actorEmail,
      actorRole: entry.actorRole ?? '',
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason ?? '',
      createdAt: entry.createdAt,
    })),
    canReadAudit,
  });
}
