import crypto from 'crypto';
import { connectToDatabase } from './mongo';
import { UserModel } from './models/user';

// Configuration. No fallback: signing session cookies (including Admin-role
// sessions) with a hardcoded, publicly-known secret would let anyone forge a
// valid cookie by computing the same HMAC, so fail closed instead.
// Read into a separate binding and re-declared as a definite string: a throw
// guarding a module-level const does not narrow it for the rest of the module,
// so every crypto call downstream would otherwise see `string | undefined`.
const SESSION_SECRET_ENV = process.env.SESSION_SECRET;
if (!SESSION_SECRET_ENV) {
  throw new Error(
    'SESSION_SECRET environment variable is required to sign and verify session cookies.'
  );
}
const SESSION_SECRET: string = SESSION_SECRET_ENV;
const SESSION_COOKIE_NAME = 'auth_session';
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 1 week
} as const;

/**
 * Server-side maximum age for a session, independent of the cookie's Max-Age.
 *
 * Max-Age is a request to the browser and nothing more: a cookie copied out of
 * devtools and replayed by any HTTP client ignores it entirely. Until this
 * check existed a leaked session token was valid forever, because the payload
 * carried a createdAt that nothing ever read.
 */
const MAX_SESSION_AGE_MS = SESSION_COOKIE_OPTIONS.maxAge * 1000;

export interface SessionData {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'Admin' | 'Trader';
    createdAt: string;
    /**
     * Revocation counter, compared against the user's stored tokenVersion on
     * every request. Bumping the stored value invalidates every session issued
     * before the bump, which is what makes logout, password reset, and account
     * suspension take effect immediately rather than whenever the cookie
     * happens to expire.
     */
    tokenVersion: number;
  };
  createdAt: number;
}

/**
 * Create a signed session cookie
 */
function createSessionCookie(sessionData: SessionData): string {
  const payload = Buffer.from(JSON.stringify(sessionData)).toString('base64');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

/**
 * Verify and extract session data from cookie
 */
function verifySessionCookie(cookie: string): SessionData | null {
  try {
    const [payload, signature] = cookie.split('.');
    if (!payload || !signature) return null;

    const expectedSignature = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const isValid =
      Buffer.byteLength(signature) === Buffer.byteLength(expectedSignature) &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    if (!isValid) return null;

    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    const session = JSON.parse(decoded) as SessionData;

    if (typeof session.createdAt !== 'number') return null;
    if (Date.now() - session.createdAt > MAX_SESSION_AGE_MS) return null;

    // Cookies issued before revocation existed carry no tokenVersion. They are
    // rejected rather than defaulted, because defaulting would let a token
    // minted under the old un-revocable scheme keep working.
    if (typeof session.user?.tokenVersion !== 'number') return null;

    return session;
  } catch {
    return null;
  }
}

/**
 * Confirms a signed session still corresponds to a live, unrevoked account,
 * and returns it with authority re-read from the database.
 *
 * A signature only proves the cookie was issued by us, not that it is still
 * valid. Role in particular is never trusted from the payload: it is stamped
 * at sign-in and would otherwise survive a demotion for the life of the
 * cookie, leaving a removed admin with admin access for up to a week.
 */
async function resolveCurrentSession(session: SessionData): Promise<SessionData | null> {
  // The app supports a JSON-file user store when Mongo is not configured at
  // all. In that mode there is nothing to check against, so the signature and
  // expiry are all we have; when Mongo IS configured, a failure to reach it
  // fails closed rather than skipping the check.
  if (!process.env.MONGODB_URI) return session;

  const connection = await connectToDatabase();
  if (!connection) return null;

  const record = await UserModel.findById(session.user.id)
    .select('tokenVersion status role')
    .lean();

  if (!record) return null;
  if ((record.tokenVersion ?? 0) !== session.user.tokenVersion) return null;
  if (record.status === 'suspended') return null;

  return { ...session, user: { ...session.user, role: record.role } };
}

/**
 * Get session from request
 */
export async function getSessionFromRequest(request: Request): Promise<SessionData | null> {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .reduce(
      (acc, curr) => {
        const [key, ...valueParts] = curr.split('=');
        if (key) {
          acc[key.trim()] = valueParts.join('=');
        }
        return acc;
      },
      {} as Record<string, string>
    );

  // First, check for the existing custom session cookie (auth_session)
  const sessionCookie = cookies[SESSION_COOKIE_NAME];
  if (sessionCookie) {
    const session = verifySessionCookie(sessionCookie);
    if (session) return resolveCurrentSession(session);
  }

  // If not found or invalid, check for the NextAuth JWT cookie (next-auth.session-token)
  const nextAuthToken = cookies['next-auth.session-token'];
  if (nextAuthToken) {
    try {
      const { decode } = await import('next-auth/jwt');
      const decoded = (await decode({
        token: nextAuthToken,
        secret: SESSION_SECRET,
      })) as {
        id: string;
        email: string;
        name: string;
        role: 'Admin' | 'Trader';
        createdAt: string;
        tokenVersion?: number;
      } | null;
      if (decoded) {
        // Map the decoded token to the SessionData shape expected by the rest
        // of the app, then put it through the same revocation check as a
        // first-party cookie - an OAuth session is no less worth revoking.
        return resolveCurrentSession({
          user: {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            role: decoded.role,
            createdAt: decoded.createdAt,
            tokenVersion: decoded.tokenVersion ?? 0,
          },
          createdAt: Date.now(), // session creation time (now)
        });
      }
    } catch (error) {
      // If the token is invalid, fall through to return null
      console.error('Error verifying NextAuth JWT:', error);
    }
  }

  return null;
}

/**
 * Set session cookie in response
 */
export function setCookie(response: Response, sessionData: SessionData): Response {
  const sessionCookie = createSessionCookie(sessionData);
  const headers = new Headers(response.headers);
  headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${sessionCookie}; HttpOnly; Path=/; Max-Age=${SESSION_COOKIE_OPTIONS.maxAge}; SameSite=${SESSION_COOKIE_OPTIONS.sameSite}${SESSION_COOKIE_OPTIONS.secure ? '; Secure' : ''}`
  );
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Short-lived proof that the password step succeeded, exchanged for a real
 * session once the PIN is accepted.
 *
 * Deliberately not a session and not readable as one: it carries its own
 * prefix, is signed over a different string, and getSessionFromRequest never
 * looks at it. A password alone therefore grants no access to anything - the
 * only thing this token can do is be presented to the PIN endpoints.
 */
const PENDING_PIN_PREFIX = 'pinpending';
const PENDING_PIN_TTL_MS = 5 * 60 * 1000;

export function createPendingPinToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, issuedAt: Date.now(), scope: PENDING_PIN_PREFIX })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${PENDING_PIN_PREFIX}:${payload}`)
    .digest('hex');
  return `${PENDING_PIN_PREFIX}.${payload}.${signature}`;
}

/** Returns the userId the token was issued for, or null if it is not usable. */
export function verifyPendingPinToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;

  const [prefix, payload, signature] = token.split('.');
  if (prefix !== PENDING_PIN_PREFIX || !payload || !signature) return null;

  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${PENDING_PIN_PREFIX}:${payload}`)
    .digest('hex');

  if (
    Buffer.byteLength(signature) !== Buffer.byteLength(expected) ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      userId?: string;
      issuedAt?: number;
      scope?: string;
    };
    if (decoded.scope !== PENDING_PIN_PREFIX) return null;
    if (typeof decoded.issuedAt !== 'number') return null;
    if (Date.now() - decoded.issuedAt > PENDING_PIN_TTL_MS) return null;
    return decoded.userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Invalidates every session currently issued for a user.
 *
 * Call on logout, password reset, and any administrative action that should
 * cut off access now. Cheap by design - one counter bump beats maintaining a
 * server-side session table, and it cannot be defeated by a token the client
 * has already been handed.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  if (!process.env.MONGODB_URI) return;
  const connection = await connectToDatabase();
  if (!connection) return;
  await UserModel.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
}

/**
 * Clear session cookie
 */
export function clearCookie(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=${SESSION_COOKIE_OPTIONS.sameSite}${SESSION_COOKIE_OPTIONS.secure ? '; Secure' : ''}`
  );
  return new Response(response.body, { status: response.status, headers });
}
