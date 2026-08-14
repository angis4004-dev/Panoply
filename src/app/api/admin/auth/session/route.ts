import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '@/lib/admin/guard';

/**
 * Who is signed in, and what may they do.
 *
 * requireAdmin rather than requireActiveAdmin: an account with an outstanding
 * password change still needs to be able to read its own state, or the console
 * cannot render the screen that tells it to change the password.
 */
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { admin, permissions, sessionId } = guard.ctx;

  return adminJson({
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      mustChangePassword: admin.mustChangePassword,
      mustSetPin: admin.mustSetPin,
    },
    permissions,
    sessionId,
  });
}
