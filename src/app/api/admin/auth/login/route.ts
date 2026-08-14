import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { AdminUserModel } from '@/lib/models/AdminUser';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { requireAdminSurface } from '@/lib/admin/guard';
import { adminLoginSchema } from '@/lib/admin/validation';
import { parseBody } from '@/lib/validation';
import {
  ADMIN_LOGIN_LOCKOUT_MS,
  MAX_ADMIN_LOGIN_ATTEMPTS,
  lockRemainingMs,
  verifySecret,
} from '@/lib/admin/credentials';
import { ADMIN_CHALLENGE_TTL_SECONDS, createChallengeToken } from '@/lib/admin/session';
import { serializeChallengeCookie } from '@/lib/admin/cookie';
import { checkLimit, consumeAttempt, formatRetryAfter, getClientIp } from '@/lib/rate-limit';

/**
 * Step one of admin sign-in: the password.
 *
 * Clearing it produces no session and no access. It produces a five-minute
 * challenge cookie whose only use is the PIN endpoint, so a stolen or guessed
 * admin password on its own reaches nothing.
 *
 * Three limits stack here, because a console credential is worth spending
 * effort on:
 *
 *   - per-IP, which slows a spray across many accounts;
 *   - per-account, which cannot be evaded by rotating x-forwarded-for;
 *   - a persistent per-account lockout on the admin document, which survives a
 *     restart and applies across every server instance.
 */

const GENERIC_FAILURE = 'Those credentials were not accepted.';

function noStore(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

async function recordAuthEvent(spec: {
  action: string;
  email: string;
  adminId?: string | null;
  reason: string;
  ip: string;
  userAgent: string;
}) {
  try {
    await AdminAuditLogModel.create({
      actorAdminId: spec.adminId ?? null,
      actorEmail: spec.email,
      actorRole: '',
      action: spec.action,
      targetType: 'session',
      targetId: spec.adminId ?? spec.email,
      before: {},
      after: {},
      reason: spec.reason,
      ip: spec.ip,
      userAgent: spec.userAgent.slice(0, 400),
    });
  } catch (error) {
    // A failed audit write must not turn a rejected sign-in into a 500, which
    // would tell the caller something about the account they should not learn.
    console.error('Failed to record admin auth event:', spec.action, error);
  }
}

export async function POST(request: NextRequest) {
  const wrongSurface = requireAdminSurface(request);
  if (wrongSurface) return wrongSurface;

  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') ?? '';

  // whenUnavailable: 'deny' on every limiter call in this handler. This is the
  // console's front door, so an unthrottled window is an open invitation to
  // credential stuffing - and denying costs a legitimate operator nothing they
  // had not already lost, because the handler returns 503 a few lines below
  // when the database is down. There is no state of the world in which failing
  // open here lets someone sign in who otherwise could not.
  const ipLimit = await checkLimit(`admin-login-ip:${ip}`, 20, 15 * 60 * 1000, {
    whenUnavailable: 'deny',
  });
  if (ipLimit.limited) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${formatRetryAfter(ipLimit.retryAfterMs)}.` },
      { status: 429, headers: noStore() }
    );
  }

  const { data: body, error: invalid } = await parseBody(request, adminLoginSchema);
  if (invalid) return invalid;

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json(
      { error: 'Database connection unavailable' },
      { status: 503, headers: noStore() }
    );
  }

  await consumeAttempt(`admin-login-ip:${ip}`, 20, 15 * 60 * 1000, {
    whenUnavailable: 'deny',
  });
  const accountLimit = await consumeAttempt(
    `admin-login-account:${body.email}`,
    MAX_ADMIN_LOGIN_ATTEMPTS,
    ADMIN_LOGIN_LOCKOUT_MS,
    { whenUnavailable: 'deny' }
  );
  if (accountLimit.limited) {
    return NextResponse.json(
      {
        error: `Too many attempts for this account. Try again in ${formatRetryAfter(accountLimit.retryAfterMs)}.`,
      },
      { status: 429, headers: noStore() }
    );
  }

  const admin = await AdminUserModel.findOne({ email: body.email });

  // No account, suspended account, and wrong password all answer identically.
  // Distinguishing them turns this endpoint into a way to enumerate who has
  // console access, which is a useful thing for an attacker to know before
  // spending their attempts.
  if (!admin || admin.status !== 'active') {
    await recordAuthEvent({
      action: 'admin.login_failed',
      email: body.email,
      adminId: admin?._id.toString() ?? null,
      reason: admin ? 'Account is suspended.' : 'No admin account for that address.',
      ip,
      userAgent,
    });
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401, headers: noStore() });
  }

  const lockedFor = lockRemainingMs({
    failedAttempts: admin.loginFailedAttempts,
    lockedUntil: admin.loginLockedUntil,
  });
  if (lockedFor > 0) {
    return NextResponse.json(
      { error: `This account is locked. Try again in ${formatRetryAfter(lockedFor)}.` },
      { status: 429, headers: noStore() }
    );
  }

  if (!verifySecret(body.password, admin.passwordHash)) {
    const attempts = (admin.loginFailedAttempts ?? 0) + 1;
    const shouldLock = attempts >= MAX_ADMIN_LOGIN_ATTEMPTS;
    await AdminUserModel.updateOne(
      { _id: admin._id },
      {
        $set: {
          loginFailedAttempts: shouldLock ? 0 : attempts,
          loginLockedUntil: shouldLock ? new Date(Date.now() + ADMIN_LOGIN_LOCKOUT_MS) : null,
        },
      }
    );
    await recordAuthEvent({
      action: 'admin.login_failed',
      email: admin.email,
      adminId: admin._id.toString(),
      reason: shouldLock ? 'Wrong password; account locked.' : 'Wrong password.',
      ip,
      userAgent,
    });
    return NextResponse.json({ error: GENERIC_FAILURE }, { status: 401, headers: noStore() });
  }

  await AdminUserModel.updateOne(
    { _id: admin._id },
    { $set: { loginFailedAttempts: 0, loginLockedUntil: null } }
  );

  const response = NextResponse.json(
    {
      step: admin.mustSetPin ? 'set-pin' : 'pin',
      name: admin.name,
    },
    { status: 200, headers: noStore() }
  );
  response.headers.append(
    'Set-Cookie',
    serializeChallengeCookie(createChallengeToken(admin._id.toString()), {
      maxAgeSeconds: ADMIN_CHALLENGE_TTL_SECONDS,
    })
  );
  return response;
}
