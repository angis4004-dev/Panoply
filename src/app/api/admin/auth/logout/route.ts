import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireAdminSurface } from '@/lib/admin/guard';
import { revokeAdminSession } from '@/lib/admin/session';
import { recordAdminAction } from '@/lib/admin/audit';
import { serializeClearedAdminCookie, serializeClearedChallengeCookie } from '@/lib/admin/cookie';

/**
 * Sign out.
 *
 * The session row is revoked server-side, not merely forgotten by the browser:
 * a cookie already copied elsewhere has to stop working, and clearing it on
 * one machine cannot do that.
 *
 * Always answers 200 and always clears the cookies, even for a request with no
 * valid session. Someone pressing sign-out on an expired session wants the
 * browser cleaned up, not an error.
 */
export async function POST(request: NextRequest) {
  const wrongSurface = requireAdminSurface(request);
  if (wrongSurface) return wrongSurface;

  const guard = await requireAdmin(request);
  if (guard.ok) {
    await revokeAdminSession(guard.ctx.sessionId, { reason: 'Signed out.' });
    await recordAdminAction(guard.ctx, {
      action: 'admin.logout',
      targetType: 'session',
      targetId: guard.ctx.sessionId,
      reason: 'Signed out.',
    });
  }

  const response = NextResponse.json(
    { signedOut: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
  response.headers.append('Set-Cookie', serializeClearedAdminCookie());
  response.headers.append('Set-Cookie', serializeClearedChallengeCookie());
  return response;
}
