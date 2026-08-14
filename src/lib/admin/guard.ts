import { NextResponse, type NextRequest } from 'next/server';
import { getClientIp } from '@/lib/rate-limit';
import { hasPermission, type Permission } from './permissions';
import { resolveAdminSession, type AdminSessionContext } from './session';
import { classifyHost, hostConfigFromEnv, isAdminHostConfigured } from './host';

/**
 * The one gate every admin API route passes through.
 *
 * Four things are checked, in this order, and the order matters:
 *
 * 1. The request arrived on the admin host. An admin API reachable on
 *    app.example.com would make the subdomain split cosmetic - anything with a
 *    valid admin cookie could be induced to call it from the trader origin.
 * 2. In production, the admin host is actually configured. Without it the
 *    development `admin.` prefix rule applies, and a wildcard DNS entry would
 *    be enough to serve the console. Failing closed here is the difference
 *    between a misconfiguration and a breach.
 * 3. A live admin session exists. Not a trader session - resolveAdminSession
 *    reads a differently-named, host-only cookie and knows nothing about
 *    `auth_session`.
 * 4. The session holds the specific permission the route needs.
 *
 * Every admin route calls this. There is no variant that skips the host check
 * or takes the role on trust, because the previous design's single
 * `role !== 'Admin'` helper is exactly what let twelve routes share one
 * coarse answer to twelve different questions.
 */

export interface AdminRequestContext extends AdminSessionContext {
  request: NextRequest;
}

export type GuardResult =
  { ok: true; ctx: AdminRequestContext } | { ok: false; response: NextResponse };

/**
 * Responses carry no detail about why they failed beyond the status.
 *
 * "No admin session" and "wrong permission" are distinguished, because an
 * operator staring at a 403 needs to know whether to sign in again or ask for
 * access. But nothing here confirms whether a resource exists, and the
 * unauthenticated case never hints that the path is real.
 */
function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401, headers: noStore() });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403, headers: noStore() });
}

function notFound() {
  // A 404, not a 403. On the trader host the admin API does not exist as far
  // as any caller is concerned; confirming its presence there tells an
  // attacker where to point a stolen cookie.
  return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore() });
}

function noStore(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

/**
 * The host half of the gate on its own.
 *
 * Used by the sign-in endpoints, which by definition have no session yet but
 * must still be unreachable from the trader origin - otherwise a page on
 * app.example.com could drive the admin login form and read its responses.
 *
 * Returns null when the request is on the admin surface, or the 404 to send
 * back when it is not.
 */
export function requireAdminSurface(request: NextRequest): NextResponse | null {
  const config = hostConfigFromEnv();

  if (classifyHost(request.headers.get('host'), config) !== 'admin') {
    return notFound();
  }

  if (process.env.NODE_ENV === 'production' && !isAdminHostConfigured(config)) {
    console.error(
      'ADMIN_HOST is not configured. Refusing to serve the admin API rather than ' +
        'falling back to matching any hostname beginning with "admin.".'
    );
    return notFound();
  }

  return null;
}

export async function requireAdmin(
  request: NextRequest,
  permission?: Permission
): Promise<GuardResult> {
  const wrongSurface = requireAdminSurface(request);
  if (wrongSurface) return { ok: false, response: wrongSurface };

  const session = await resolveAdminSession(request);
  if (!session) {
    return { ok: false, response: unauthorized('Admin authentication required.') };
  }

  if (permission && !hasPermission(session.admin, permission)) {
    return {
      ok: false,
      response: forbidden(`This action requires the ${permission} permission.`),
    };
  }

  return {
    ok: true,
    ctx: {
      ...session,
      request,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent') ?? '',
    },
  };
}

/**
 * Blocks an admin who has outstanding credential setup from doing anything
 * else.
 *
 * Applied by requireActiveAdmin rather than inside requireAdmin, so that the
 * credential-setup endpoints themselves - which an admin with a provisional
 * password has to be able to reach - stay open to a session that is otherwise
 * refused everywhere.
 */
export function requireGoodStanding(ctx: AdminRequestContext): NextResponse | null {
  if (ctx.admin.mustChangePassword) {
    return NextResponse.json(
      { error: 'Set a new password before using the console.', code: 'password_change_required' },
      { status: 403, headers: noStore() }
    );
  }
  if (ctx.admin.mustSetPin) {
    return NextResponse.json(
      { error: 'Set your PIN before using the console.', code: 'pin_setup_required' },
      { status: 403, headers: noStore() }
    );
  }
  return null;
}

/**
 * requireAdmin plus the good-standing check, which is what nearly every route
 * actually wants.
 */
export async function requireActiveAdmin(
  request: NextRequest,
  permission?: Permission
): Promise<GuardResult> {
  const result = await requireAdmin(request, permission);
  if (!result.ok) return result;
  const standing = requireGoodStanding(result.ctx);
  if (standing) return { ok: false, response: standing };
  return result;
}

/** Attaches the console's cache and indexing headers to a success response. */
export function adminJson(body: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...noStore(), ...(init.headers as Record<string, string> | undefined) },
  });
}
