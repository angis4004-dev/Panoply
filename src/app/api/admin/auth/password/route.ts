import { NextRequest } from 'next/server';
import { AdminUserModel } from '@/lib/models/AdminUser';
import { adminJson, requireAdmin } from '@/lib/admin/guard';
import { adminChangePasswordSchema } from '@/lib/admin/validation';
import { parseBody } from '@/lib/validation';
import { hashSecret, verifySecret } from '@/lib/admin/credentials';
import { revokeAllAdminSessions, createAdminSession } from '@/lib/admin/session';
import { recordAdminAction } from '@/lib/admin/audit';
import { serializeAdminCookie } from '@/lib/admin/cookie';

/**
 * Change your own admin password.
 *
 * requireAdmin, not requireActiveAdmin - an account created with
 * mustChangePassword can reach nothing else, so this endpoint has to stay open
 * to it or the account is permanently stuck.
 *
 * Changing the password ends every session for the account and issues a fresh
 * one to the caller. That is the point of changing it: if the old one was
 * known to someone else, so is any session they opened with it.
 */
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { data: body, error: invalid } = await parseBody(request, adminChangePasswordSchema);
  if (invalid) return invalid;

  const admin = await AdminUserModel.findById(ctx.admin.id);
  if (!admin) return adminJson({ error: 'Admin account not found.' }, { status: 404 });

  if (!verifySecret(body.currentPassword, admin.passwordHash)) {
    return adminJson({ error: 'Your current password was not accepted.' }, { status: 401 });
  }

  if (verifySecret(body.password, admin.passwordHash)) {
    return adminJson(
      { error: 'The new password must differ from the current one.' },
      { status: 400 }
    );
  }

  await AdminUserModel.updateOne(
    { _id: admin._id },
    {
      $set: {
        passwordHash: hashSecret(body.password),
        mustChangePassword: false,
        loginFailedAttempts: 0,
        loginLockedUntil: null,
      },
    }
  );

  await recordAdminAction(ctx, {
    action: 'admin.password_change',
    targetType: 'admin',
    targetId: ctx.admin.id,
    // No before/after: the only thing that changed is a secret, and the audit
    // log records that it changed, never what it changed to or from.
    reason: 'Admin changed their own password.',
  });

  await revokeAllAdminSessions(admin._id, { reason: 'Password changed.' });

  const session = await createAdminSession(admin._id, {
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  const response = adminJson({ changed: true, expiresAt: session.expiresAt });
  response.headers.append(
    'Set-Cookie',
    serializeAdminCookie(session.token, { maxAgeSeconds: session.maxAgeSeconds })
  );
  return response;
}
