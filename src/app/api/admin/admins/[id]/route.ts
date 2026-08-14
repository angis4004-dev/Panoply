import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { AdminUserModel } from '@/lib/models/AdminUser';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { adminUpdateSchema } from '@/lib/admin/validation';
import { objectId, parseBody } from '@/lib/validation';
import { canManageAdmin, canSetPermissions, effectivePermissions } from '@/lib/admin/permissions';
import { revokeAllAdminSessions } from '@/lib/admin/session';

/**
 * Suspend, reactivate, or re-permission one admin. MainAdmin only.
 *
 * The rules about who may do this to whom live in
 * src/lib/admin/permissions.ts, not here, so they can be tested without a
 * request and cannot be stated slightly differently by the next endpoint that
 * needs them.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'admin.read');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid admin id' }, { status: 400 });
  }

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const admin = await AdminUserModel.findById(id)
    .select(
      'name email role status grantedPermissions createdAt lastLoginAt disabledAt disabledReason'
    )
    .lean();
  if (!admin) return adminJson({ error: 'Admin not found' }, { status: 404 });

  const activity = await AdminAuditLogModel.find({ actorAdminId: id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return adminJson({
    admin: {
      id: String(admin._id),
      name: admin.name,
      email: admin.email,
      role: admin.role,
      status: admin.status,
      grantedPermissions: admin.grantedPermissions ?? [],
      effectivePermissions: effectivePermissions({
        id: String(admin._id),
        email: admin.email,
        role: admin.role,
        status: admin.status,
        grantedPermissions: admin.grantedPermissions ?? [],
      }),
      createdAt: admin.createdAt,
      lastLoginAt: admin.lastLoginAt ?? null,
      disabledAt: admin.disabledAt ?? null,
      disabledReason: admin.disabledReason ?? '',
    },
    activity: activity.map((entry) => ({
      id: String(entry._id),
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason ?? '',
      reference: entry.reference ?? '',
      ip: entry.ip ?? '',
      createdAt: entry.createdAt,
    })),
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'admin.manage');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid admin id' }, { status: 400 });
  }

  const { data: body, error: invalid } = await parseBody(request, adminUpdateSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const target = await AdminUserModel.findById(id)
    .select('name email role status grantedPermissions')
    .lean();
  if (!target) return adminJson({ error: 'Admin not found' }, { status: 404 });

  const shape = { id: String(target._id), role: target.role, status: target.status };

  const manage = canManageAdmin(ctx.admin, shape);
  if (!manage.allowed) return adminJson({ error: manage.reason }, { status: 403 });

  if (body.permissions) {
    const decision = canSetPermissions(ctx.admin, shape, body.permissions);
    if (!decision.allowed) return adminJson({ error: decision.reason }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (body.permissions) updates.grantedPermissions = body.permissions;
  if (body.status) {
    updates.status = body.status;
    updates.disabledAt = body.status === 'suspended' ? new Date() : null;
    updates.disabledByAdminId = body.status === 'suspended' ? ctx.admin.id : null;
    updates.disabledReason = body.status === 'suspended' ? (body.reason ?? '') : '';
  }

  const updated = await AdminUserModel.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  )
    .select('name email role status grantedPermissions disabledAt disabledReason')
    .lean();
  if (!updated) return adminJson({ error: 'Admin not found' }, { status: 404 });

  // Suspension has to take effect now. resolveAdminSession refuses a
  // suspended account on the next request anyway, but cutting the rows means
  // the session list stops showing them as live and the account is denied by
  // two independent checks rather than one.
  if (body.status === 'suspended') {
    await revokeAllAdminSessions(id, {
      byAdminId: ctx.admin.id,
      reason: body.reason ?? 'Account suspended.',
    });
  }

  await recordAdminAction(ctx, {
    action: body.status ? 'admin.status_change' : 'admin.permissions_change',
    targetType: 'admin',
    targetId: id,
    before: {
      status: target.status,
      grantedPermissions: target.grantedPermissions ?? [],
    },
    after: {
      status: updated.status,
      grantedPermissions: updated.grantedPermissions ?? [],
    },
    reason: body.reason ?? '',
  });

  return adminJson({
    admin: {
      id: String(updated._id),
      name: updated.name,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      grantedPermissions: updated.grantedPermissions ?? [],
      disabledAt: updated.disabledAt ?? null,
      disabledReason: updated.disabledReason ?? '',
    },
  });
}
