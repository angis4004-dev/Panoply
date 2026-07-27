import { NextResponse } from 'next/server';
import { signInUser } from '@/lib/auth-store';
import type { LoginPayload } from '@/types/auth';
import { setCookie } from '@/lib/session';
import { isRateLimited, recordAttempt, resetRateLimit, getClientIp } from '@/lib/rate-limit';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginPayload;

    if (!body?.email || !body?.password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    // Key on IP + email so a typo-prone legitimate user isn't locked out by
    // someone else's failed attempts against their address, while still
    // capping how many guesses one client can throw at one account.
    const rateLimitKey = `${getClientIp(request)}:${body.email.toLowerCase().trim()}`;
    if (isRateLimited(rateLimitKey, MAX_ATTEMPTS, WINDOW_MS)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      );
    }

    let result;
    try {
      result = await signInUser(body);
    } catch (err) {
      recordAttempt(rateLimitKey, WINDOW_MS);
      throw err;
    }
    resetRateLimit(rateLimitKey);

    // Create session data
    const sessionData = {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        createdAt:
          typeof result.user.createdAt === 'string'
            ? result.user.createdAt
            : (result.user.createdAt as Date).toISOString(),
      },
      createdAt: Date.now(),
    };

    // Create response and set session cookie
    const response = NextResponse.json({
      user: result.user,
      // Note: token is kept for backward compatibility but not used
      token: result.token,
    });

    // Set the session cookie
    return setCookie(response, sessionData);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign in.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
