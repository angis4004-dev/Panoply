import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { AdminUserModel } from '@/lib/models/AdminUser';
import { AdminSessionModel } from '@/lib/models/AdminSession';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { adminCreateSchema } from '@/lib/admin/validation';
import { parseBody } from '@/lib/validation';
import {
  ADMIN_DEFAULT_PERMISSIONS,
  canCreateAdmin,
  effectivePermissions,
  grantablePermissions,
} from '@/lib/admin/permissions';
import { generateInitialPassword, hashSecret } from '@/lib/admin/credentials';

/** The admin roster, and the MainAdmin-only path that adds to it. */

export async function GET(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'admin.read');
  if (!guard.ok) return guard.response;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const admins = await AdminUserModel.find({})
    .select(
      'name email role status grantedPermissions createdAt lastLoginAt lastLoginIp disabledAt disabledReason mustChangePassword mustSetPin'
    )
    .sort({ role: 1, createdAt: 1 })
    .lean();

  const now = new Date();
  const openSessions = await AdminSessionModel.aggregate<{ _id: unknown; count: number }>([
    { $match: { revokedAt: null, expiresAt: { $gt: now }, idleExpiresAt: { $gt: now } } },
    { $group: { _id: '$adminId', count: { $sum: 1 } } },
  ]);
  const sessionCounts = new Map(openSessions.map((row) => [String(row._id), row.count]));

  return adminJson({
    admins: admins.map((admin) => ({
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
      openSessions: sessionCounts.get(String(admin._id)) ?? 0,
      createdAt: admin.createdAt,
      lastLoginAt: admin.lastLoginAt ?? null,
      lastLoginIp: admin.lastLoginIp ?? '',
      disabledAt: admin.disabledAt ?? null,
      disabledReason: admin.disabledReason ?? '',
      pendingSetup: Boolean(admin.mustChangePassword || admin.mustSetPin),
    })),
    // The console renders its permission checkboxes from this, so a permission
    // added to the model appears in the UI without a second edit - and one
    // reserved to the MainAdmin can never appear at all.
    grantable: grantablePermissions(),
    adminDefaults: ADMIN_DEFAULT_PERMISSIONS,
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'admin.create');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { data: body, error: invalid } = await parseBody(request, adminCreateSchema);
  if (invalid) return invalid;

  // Belt and braces. The permission gate above already restricts this to the
  // MainAdmin, and the schema has no role field, but the hierarchy rule is
  // asserted here too so it is enforced by the module that defines it rather
  // than by the absence of an input.
  const decision = canCreateAdmin(ctx.admin, 'Admin');
  if (!decision.allowed) return adminJson({ error: decision.reason }, { status: 403 });

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const clash = await AdminUserModel.exists({ email: body.email });
  if (clash) {
    return adminJson(
      { error: 'An admin account with this email already exists.' },
      { status: 409 }
    );
  }

  const initialPassword = generateInitialPassword();

  const created = await AdminUserModel.create({
    name: body.name,
    email: body.email,
    role: 'Admin',
    status: 'active',
    passwordHash: hashSecret(initialPassword),
    grantedPermissions: body.permissions,
    createdByAdminId: ctx.admin.id,
    // Both true. The password is about to be read aloud or pasted into a
    // message, and the account has no second factor yet; it gets exactly one
    // sign-in before it has to fix both.
    mustChangePassword: true,
    mustSetPin: true,
  });

  await recordAdminAction(ctx, {
    action: 'admin.create',
    targetType: 'admin',
    targetId: created._id.toString(),
    after: {
      email: created.email,
      role: 'Admin',
      grantedPermissions: body.permissions,
    },
    reason: 'Admin account created by the MainAdmin.',
  });

  return adminJson(
    {
      admin: {
        id: created._id.toString(),
        name: created.name,
        email: created.email,
        role: created.role,
        status: created.status,
        grantedPermissions: created.grantedPermissions,
      },
      // Shown once and never recoverable. The account must change it on first
      // sign-in, so its only job is to survive the trip to the new operator.
      initialPassword,
    },
    { status: 201 }
  );
}
