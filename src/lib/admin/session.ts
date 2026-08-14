import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { AdminUserModel, type IAdminUser } from '@/lib/models/AdminUser';
import { AdminSessionModel } from '@/lib/models/AdminSession';
import { effectivePermissions, type AdminPrincipal, type Permission } from './permissions';
import { readAdminToken, readCookie, adminChallengeCookieName } from './cookie';

/**
 * Admin session lifecycle: mint, resolve, slide, revoke.
 *
 * The cookie holds an opaque random token and the database holds everything
 * else. That is the opposite of the trader session, which is self-contained
 * and signed, and the difference is deliberate: an operations console has to
 * be able to answer "which sessions are open" and "end that one, not mine",
 * and a stateless token cannot answer either.
 */

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required for admin authentication.');
}
const SECRET: string = SESSION_SECRET;

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Hard ceiling on a session, reached regardless of activity. Default 8 hours. */
export const ADMIN_SESSION_ABSOLUTE_MS =
  positiveIntEnv('ADMIN_SESSION_MAX_MINUTES', 8 * 60) * 60 * 1000;

/** Rolling inactivity deadline. Default 30 minutes. */
export const ADMIN_SESSION_IDLE_MS = positiveIntEnv('ADMIN_SESSION_IDLE_MINUTES', 30) * 60 * 1000;

/**
 * How stale lastSeenAt is allowed to get before the slide is written.
 *
 * Without this, every authenticated request writes to the sessions collection,
 * which turns a page with six parallel fetches into six writes. A minute of
 * imprecision on a thirty-minute idle window costs nothing.
 */
const SLIDE_WRITE_INTERVAL_MS = 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface AdminSessionContext {
  admin: AdminPrincipal & { name: string; mustChangePassword: boolean; mustSetPin: boolean };
  sessionId: string;
  permissions: Permission[];
  ip: string;
  userAgent: string;
}

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
  maxAgeSeconds: number;
}

/**
 * Mints a session for an admin who has just cleared both factors.
 *
 * 32 bytes of randomness, stored only as a SHA-256. Nothing about the admin is
 * encoded in the token, so it cannot be inspected, and a leaked database dump
 * does not yield usable tokens.
 */
export async function createAdminSession(
  adminId: string | mongoose.Types.ObjectId,
  meta: { ip: string; userAgent: string }
): Promise<CreatedSession> {
  const connection = await connectToDatabase();
  if (!connection) throw new Error('Database connection unavailable');

  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = new Date(now + ADMIN_SESSION_ABSOLUTE_MS);

  const created = await AdminSessionModel.create({
    adminId,
    tokenHash: hashToken(token),
    expiresAt,
    idleExpiresAt: new Date(now + ADMIN_SESSION_IDLE_MS),
    lastSeenAt: new Date(now),
    ip: meta.ip,
    userAgent: meta.userAgent.slice(0, 400),
  });

  return {
    token,
    sessionId: created._id.toString(),
    expiresAt,
    // The cookie's Max-Age matches the absolute expiry. The idle deadline is
    // enforced server-side only - a cookie cannot express "expires 30 minutes
    // after you stop using it", and a client-side hint would be advisory
    // anyway.
    maxAgeSeconds: Math.floor(ADMIN_SESSION_ABSOLUTE_MS / 1000),
  };
}

function toPrincipal(admin: IAdminUser): AdminSessionContext['admin'] {
  return {
    id: admin._id.toString(),
    email: admin.email,
    name: admin.name,
    role: admin.role,
    status: admin.status,
    grantedPermissions: admin.grantedPermissions ?? [],
    mustChangePassword: Boolean(admin.mustChangePassword),
    mustSetPin: Boolean(admin.mustSetPin),
  };
}

/**
 * Resolves a request's admin cookie to a live session, or null.
 *
 * Every condition is re-read from the database on every request: revocation,
 * both expiries, and the admin's own status and permissions. Nothing is
 * trusted from the cookie because the cookie carries nothing - which means a
 * suspension or a permission change takes effect on the operator's very next
 * click rather than whenever their session happens to end.
 */
export async function resolveAdminSession(request: {
  headers: Headers;
}): Promise<AdminSessionContext | null> {
  const token = readAdminToken(request.headers.get('cookie'));
  if (!token) return null;

  const connection = await connectToDatabase();
  if (!connection) return null;

  const now = new Date();
  const session = await AdminSessionModel.findOne({ tokenHash: hashToken(token) }).lean();
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt <= now) return null;
  if (session.idleExpiresAt <= now) return null;

  const admin = await AdminUserModel.findById(session.adminId).lean();
  if (!admin) return null;
  if (admin.status !== 'active') return null;

  // Slide the idle window, but not on every single request. See
  // SLIDE_WRITE_INTERVAL_MS.
  if (now.getTime() - new Date(session.lastSeenAt).getTime() > SLIDE_WRITE_INTERVAL_MS) {
    await AdminSessionModel.updateOne(
      { _id: session._id, revokedAt: null },
      {
        $set: {
          lastSeenAt: now,
          // Never past the absolute expiry: sliding must extend inactivity
          // tolerance, not the ceiling.
          idleExpiresAt: new Date(
            Math.min(now.getTime() + ADMIN_SESSION_IDLE_MS, session.expiresAt.getTime())
          ),
        },
      }
    );
  }

  const principal = toPrincipal(admin as unknown as IAdminUser);

  return {
    admin: principal,
    sessionId: session._id.toString(),
    permissions: effectivePermissions(principal),
    ip: session.ip,
    userAgent: session.userAgent,
  };
}

export async function revokeAdminSession(
  sessionId: string | mongoose.Types.ObjectId,
  options: { byAdminId?: string | mongoose.Types.ObjectId | null; reason?: string } = {}
): Promise<boolean> {
  const connection = await connectToDatabase();
  if (!connection) return false;
  const result = await AdminSessionModel.updateOne(
    { _id: sessionId, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokedByAdminId: options.byAdminId ?? null,
        revokeReason: options.reason ?? '',
      },
    }
  );
  return result.modifiedCount > 0;
}

/**
 * Ends every open session for an admin.
 *
 * Called when an account is suspended and when its password changes. The
 * status check in resolveAdminSession already denies a suspended admin, but
 * that leaves rows sitting open in the session list looking live, and it
 * relies on a single check being present; cutting the sessions makes the
 * suspension true in both places.
 */
export async function revokeAllAdminSessions(
  adminId: string | mongoose.Types.ObjectId,
  options: { byAdminId?: string | mongoose.Types.ObjectId | null; reason?: string } = {}
): Promise<number> {
  const connection = await connectToDatabase();
  if (!connection) return 0;
  const result = await AdminSessionModel.updateMany(
    { adminId, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokedByAdminId: options.byAdminId ?? null,
        revokeReason: options.reason ?? '',
      },
    }
  );
  return result.modifiedCount;
}

// --- The password → PIN challenge ----------------------------------------

const CHALLENGE_SCOPE = 'admin-pin-challenge';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const ADMIN_CHALLENGE_TTL_SECONDS = CHALLENGE_TTL_MS / 1000;

/**
 * Proof that the password step succeeded, and nothing more.
 *
 * Signed over its own scope string so it can never be mistaken for a session
 * by any code path that verifies signatures - resolveAdminSession does not
 * look at this cookie at all, and this token is not a database row, so it
 * grants access to precisely one endpoint: the PIN step.
 */
export function createChallengeToken(adminId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ adminId, issuedAt: Date.now(), scope: CHALLENGE_SCOPE })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(`${CHALLENGE_SCOPE}:${payload}`)
    .digest('hex');
  return `${payload}.${signature}`;
}

export function verifyChallengeToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${CHALLENGE_SCOPE}:${payload}`)
    .digest('hex');

  if (
    Buffer.byteLength(signature) !== Buffer.byteLength(expected) ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      adminId?: string;
      issuedAt?: number;
      scope?: string;
    };
    if (decoded.scope !== CHALLENGE_SCOPE) return null;
    if (typeof decoded.issuedAt !== 'number') return null;
    if (Date.now() - decoded.issuedAt > CHALLENGE_TTL_MS) return null;
    return decoded.adminId ?? null;
  } catch {
    return null;
  }
}

export function readChallengeToken(request: { headers: Headers }): string | null {
  return readCookie(request.headers.get('cookie'), adminChallengeCookieName());
}
