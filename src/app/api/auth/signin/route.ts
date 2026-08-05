import { NextResponse } from 'next/server';
import { signInUser } from '@/lib/auth-store';
import type { LoginPayload } from '@/types/auth';
import { setCookie, createPendingPinToken } from '@/lib/session';
import { isRateLimited, recordAttempt, resetRateLimit, getClientIp } from '@/lib/rate-limit';
import { getUserModel } from '@/lib/models';

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

    // The password alone no longer produces a session. It produces a
    // short-lived token whose only use is the PIN endpoints, so a stolen
    // password cannot reach the dashboard or any API on its own.
    const userModel = await getUserModel();
    if (userModel) {
      const record = await userModel.findById(result.user.id).select('pinHash').lean();

      if (record) {
        return NextResponse.json({
          pinRequired: Boolean(record.pinHash),
          pinSetupRequired: !record.pinHash,
          pendingToken: createPendingPinToken(result.user.id),
          user: { name: result.user.name },
        });
      }
    }

    // JSON-file fallback store: no schema to hold a PIN, so this path keeps
    // the original single-step behaviour rather than locking the user out of
    // an account the PIN could never be stored against.
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
        tokenVersion:
          'tokenVersion' in result.user ? ((result.user.tokenVersion as number) ?? 0) : 0,
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
