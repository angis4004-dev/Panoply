import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { AdminUserModel } from '@/lib/models/AdminUser';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { requireAdminSurface } from '@/lib/admin/guard';
import { adminPinSchema, adminSetPinSchema } from '@/lib/admin/validation';
import { parseBody } from '@/lib/validation';
import { isWeakPin } from '@/lib/pin';
import {
  ADMIN_PIN_LOCKOUT_MS,
  MAX_ADMIN_PIN_ATTEMPTS,
  hashSecret,
  lockRemainingMs,
  verifySecret,
} from '@/lib/admin/credentials';
import { createAdminSession, readChallengeToken, verifyChallengeToken } from '@/lib/admin/session';
import { serializeAdminCookie, serializeClearedChallengeCookie } from '@/lib/admin/cookie';
import { formatRetryAfter, getClientIp } from '@/lib/rate-limit';
import { effectivePermissions } from '@/lib/admin/permissions';

/**
 * Step two of admin sign-in: the second factor, and the only place an admin
 * session is ever minted.
 *
 * The caller must present the challenge cookie from the password step. An
 * account that has never set a PIN sets it here, in the same exchange, because
 * the alternative - letting it sign in and set one later - means the second
 * factor is optional in practice for exactly the accounts most likely to be
 * newly created and least likely to be watched.
 */

function noStore(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

export async function POST(request: NextRequest) {
  const wrongSurface = requireAdminSurface(request);
  if (wrongSurface) return wrongSurface;

  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') ?? '';

  const adminId = verifyChallengeToken(readChallengeToken(request));
  if (!adminId) {
    return NextResponse.json(
      { error: 'Your sign-in attempt expired. Start again.', code: 'challenge_expired' },
      { status: 401, headers: noStore() }
    );
  }

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json(
      { error: 'Database connection unavailable' },
      { status: 503, headers: noStore() }
    );
  }

  const admin = await AdminUserModel.findById(adminId);
  if (!admin || admin.status !== 'active') {
    return NextResponse.json(
      { error: 'Your sign-in attempt expired. Start again.' },
      { status: 401, headers: noStore() }
    );
  }

  const lockedFor = lockRemainingMs({
    failedAttempts: admin.pinFailedAttempts,
    lockedUntil: admin.pinLockedUntil,
  });
  if (lockedFor > 0) {
    return NextResponse.json(
      { error: `PIN entry is locked. Try again in ${formatRetryAfter(lockedFor)}.` },
      { status: 429, headers: noStore() }
    );
  }

  if (admin.mustSetPin || !admin.pinHash) {
    const { data: body, error: invalid } = await parseBody(request, adminSetPinSchema);
    if (invalid) return invalid;

    if (body.pin !== body.confirmPin) {
      return NextResponse.json(
        { error: 'Those PINs do not match.' },
        { status: 400, headers: noStore() }
      );
    }
    if (isWeakPin(body.pin)) {
      // Three attempts before a thirty-minute lock is only a real defence if
      // the PIN is not one of the handful an attacker would try first.
      return NextResponse.json(
        { error: 'Choose a less predictable PIN - no repeats, runs, or repeating pairs.' },
        { status: 400, headers: noStore() }
      );
    }

    await AdminUserModel.updateOne(
      { _id: admin._id },
      {
        $set: {
          pinHash: hashSecret(body.pin),
          pinSetAt: new Date(),
          mustSetPin: false,
          pinFailedAttempts: 0,
          pinLockedUntil: null,
        },
      }
    );

    return finishSignIn(admin._id.toString(), admin.email, admin.name, ip, userAgent, {
      role: admin.role,
      status: admin.status,
      grantedPermissions: admin.grantedPermissions ?? [],
      mustChangePassword: Boolean(admin.mustChangePassword),
      mustSetPin: false,
      auditReason: 'Signed in; PIN set during first sign-in.',
    });
  }

  const { data: body, error: invalid } = await parseBody(request, adminPinSchema);
  if (invalid) return invalid;

  if (!verifySecret(body.pin, admin.pinHash)) {
    const attempts = (admin.pinFailedAttempts ?? 0) + 1;
    const shouldLock = attempts >= MAX_ADMIN_PIN_ATTEMPTS;
    await AdminUserModel.updateOne(
      { _id: admin._id },
      {
        $set: {
          pinFailedAttempts: shouldLock ? 0 : attempts,
          pinLockedUntil: shouldLock ? new Date(Date.now() + ADMIN_PIN_LOCKOUT_MS) : null,
        },
      }
    );
    await AdminAuditLogModel.create({
      actorAdminId: admin._id,
      actorEmail: admin.email,
      actorRole: admin.role,
      action: 'admin.pin_failed',
      targetType: 'session',
      targetId: admin._id.toString(),
      before: {},
      after: {},
      reason: shouldLock ? 'Wrong PIN; PIN entry locked.' : 'Wrong PIN.',
      ip,
      userAgent: userAgent.slice(0, 400),
    }).catch((error) => console.error('Failed to record admin PIN failure:', error));

    return NextResponse.json(
      {
        error: shouldLock
          ? 'Too many incorrect PINs. PIN entry is locked for 30 minutes.'
          : `Incorrect PIN. ${MAX_ADMIN_PIN_ATTEMPTS - attempts} attempt(s) remaining.`,
      },
      { status: 401, headers: noStore() }
    );
  }

  await AdminUserModel.updateOne(
    { _id: admin._id },
    { $set: { pinFailedAttempts: 0, pinLockedUntil: null } }
  );

  return finishSignIn(admin._id.toString(), admin.email, admin.name, ip, userAgent, {
    role: admin.role,
    status: admin.status,
    grantedPermissions: admin.grantedPermissions ?? [],
    mustChangePassword: Boolean(admin.mustChangePassword),
    mustSetPin: false,
    auditReason: 'Signed in with password and PIN.',
  });
}

async function finishSignIn(
  adminId: string,
  email: string,
  name: string,
  ip: string,
  userAgent: string,
  state: {
    role: 'MainAdmin' | 'Admin';
    status: 'active' | 'suspended';
    grantedPermissions: string[];
    mustChangePassword: boolean;
    mustSetPin: boolean;
    auditReason: string;
  }
) {
  const session = await createAdminSession(adminId, { ip, userAgent });

  await AdminUserModel.updateOne(
    { _id: adminId },
    { $set: { lastLoginAt: new Date(), lastLoginIp: ip } }
  );

  await AdminAuditLogModel.create({
    actorAdminId: adminId,
    actorEmail: email,
    actorRole: state.role,
    action: 'admin.login',
    targetType: 'session',
    targetId: session.sessionId,
    before: {},
    after: { expiresAt: session.expiresAt },
    reason: state.auditReason,
    ip,
    userAgent: userAgent.slice(0, 400),
    sessionId: session.sessionId,
  }).catch((error) => console.error('Failed to record admin sign-in:', error));

  const permissions = effectivePermissions({
    id: adminId,
    email,
    role: state.role,
    status: state.status,
    grantedPermissions: state.grantedPermissions,
  });

  const response = NextResponse.json(
    {
      admin: {
        id: adminId,
        name,
        email,
        role: state.role,
        mustChangePassword: state.mustChangePassword,
        mustSetPin: state.mustSetPin,
      },
      permissions,
      expiresAt: session.expiresAt,
    },
    { status: 200, headers: noStore() }
  );

  response.headers.append(
    'Set-Cookie',
    serializeAdminCookie(session.token, { maxAgeSeconds: session.maxAgeSeconds })
  );
  // The challenge has been spent. Leaving it alive would let the PIN step be
  // replayed for the rest of its five minutes to mint a second session.
  response.headers.append('Set-Cookie', serializeClearedChallengeCookie());
  return response;
}
