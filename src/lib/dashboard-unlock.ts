import crypto from 'crypto';

import { UNLOCK_HEADER } from './dashboard-unlock-header';

/**
 * Proof that the PIN gate in front of the dashboard has been cleared.
 *
 * The PIN is no longer part of sign-in. A password now produces an ordinary
 * session, and that session is enough to reach the account's own settings and
 * to sign out - but not to see a balance, a position, or a deposit. The
 * dashboard asks for the PIN on arrival, and this token is what it gets back.
 *
 * Three properties, each load-bearing:
 *
 *   - Server-signed. The client cannot decide it is unlocked; only a correct
 *     PIN checked against the stored hash produces a token that verifies.
 *   - Bound to the session. The token names the user and the tokenVersion it
 *     was minted under, so it dies with the session it belongs to and cannot
 *     be carried to another account.
 *   - Never persisted. It is returned in a response body, held in a module
 *     variable on the client, and written nowhere else - no cookie, no
 *     storage. That is deliberate: a cookie survives a reload, and the
 *     requirement is that a reload asks again. Memory is the only transport
 *     that forgets at exactly the right moment.
 *
 * The TTL below is a backstop for a token that somehow outlives the tab that
 * holds it, not the primary expiry. In practice the primary expiry is the page
 * being unloaded.
 */

const UNLOCK_SCOPE = 'dashboard-unlock';
const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * The header the dashboard sends it back on.
 *
 * Re-exported so server callers keep importing it from here, but defined in
 * dashboard-unlock-header.ts - the client interceptor needs the same string and
 * must not reach the secret below. See that file.
 */
export { UNLOCK_HEADER };

/*
 * Read once, at module load, so a deployment missing the secret fails on boot
 * rather than on the first trader who tries to unlock. This module is
 * server-only for exactly this reason: `process.env.SESSION_SECRET` is
 * undefined in a browser, so anything that pulls this into the client graph
 * turns that guard into a rendering crash.
 */
function getUnlockSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE?.includes('build')) {
      throw new Error('SESSION_SECRET environment variable is required to sign dashboard unlocks.');
    }
    return 'build-time-fallback-secret-for-static-analysis-only';
  }
  return secret;
}

interface UnlockPayload {
  userId: string;
  tokenVersion: number;
  issuedAt: number;
  scope: typeof UNLOCK_SCOPE;
}

function sign(payload: string): string {
  return crypto
    .createHmac('sha256', getUnlockSecret())
    .update(`${UNLOCK_SCOPE}:${payload}`)
    .digest('hex');
}

export function createDashboardUnlockToken(userId: string, tokenVersion: number): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      tokenVersion,
      issuedAt: Date.now(),
      scope: UNLOCK_SCOPE,
    } satisfies UnlockPayload)
  ).toString('base64url');
  return `${UNLOCK_SCOPE}.${payload}.${sign(payload)}`;
}

/**
 * Returns the payload if the token is genuine and still valid, else null.
 *
 * Checks the scope explicitly. Without it a token signed for some other
 * purpose under the same secret could be replayed here, which is the mistake
 * that makes shared-secret schemes leak between features.
 */
export function verifyDashboardUnlockToken(token: unknown): UnlockPayload | null {
  if (typeof token !== 'string') return null;

  const [scope, payload, signature] = token.split('.');
  if (scope !== UNLOCK_SCOPE || !payload || !signature) return null;

  const expected = sign(payload);
  if (
    Buffer.byteLength(signature) !== Buffer.byteLength(expected) ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8')
    ) as UnlockPayload;
    if (decoded.scope !== UNLOCK_SCOPE) return null;
    if (typeof decoded.userId !== 'string' || !decoded.userId) return null;
    if (typeof decoded.tokenVersion !== 'number') return null;
    if (typeof decoded.issuedAt !== 'number') return null;
    if (Date.now() - decoded.issuedAt > UNLOCK_TTL_MS) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Whether a token unlocks this particular session.
 *
 * Pure, so the rule can be tested without a request. The tokenVersion check is
 * what makes a sign-out or a password reset revoke the unlock too: both bump
 * the counter, and a token minted under the old one stops matching.
 */
export function unlockMatchesSession(
  token: unknown,
  session: { user: { id: string; tokenVersion: number } }
): boolean {
  const payload = verifyDashboardUnlockToken(token);
  if (!payload) return false;
  return payload.userId === session.user.id && payload.tokenVersion === session.user.tokenVersion;
}

export type UnlockFailure = 'unauthenticated' | 'locked';

/**
 * The one-line form, for handlers that have already resolved their session.
 *
 * Returns a response to send, or null to carry on. Added after the existing
 * session check rather than replacing it, so every route keeps the exact 401
 * it had and gains the 423 - a rewrite of seventeen guards to save two lines
 * each would have been seventeen chances to change an error message or drop a
 * check nobody noticed was there.
 */
export function requireUnlock(
  request: Request,
  session: { user: { id: string; tokenVersion: number } }
): Response | null {
  if (unlockMatchesSession(request.headers.get(UNLOCK_HEADER), session)) return null;
  return unlockFailureResponse('locked');
}

/**
 * The response for a request that is authenticated but not unlocked.
 *
 * 423 Locked rather than 401 or 403, so the client can tell "sign in again"
 * from "enter your PIN again" without parsing a message. The dashboard uses
 * exactly that distinction to decide whether to re-show the gate or bounce to
 * sign-in.
 */
export function unlockFailureResponse(reason: UnlockFailure): Response {
  if (reason === 'unauthenticated') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return Response.json(
    { error: 'Enter your PIN to continue.', code: 'pin_required' },
    { status: 423 }
  );
}
