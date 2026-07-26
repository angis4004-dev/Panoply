import crypto from 'crypto';

// Configuration
const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production';
const SESSION_COOKIE_NAME = 'auth_session';
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 1 week
} as const;

interface SessionData {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'Admin' | 'Trader';
    createdAt: string;
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
    return JSON.parse(decoded) as SessionData;
  } catch {
    return null;
  }
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
    if (session) return session;
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
      } | null;
      if (decoded) {
        // Map the decoded token to the SessionData shape expected by the rest of the app
        return {
          user: {
            id: decoded.id,
            email: decoded.email,
            name: decoded.name,
            role: decoded.role,
            createdAt: decoded.createdAt,
          },
          createdAt: Date.now(), // session creation time (now)
        };
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
