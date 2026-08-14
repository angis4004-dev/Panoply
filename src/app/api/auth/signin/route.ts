import { NextResponse } from 'next/server';
import { signInUser } from '@/lib/auth-store';
import { setCookie } from '@/lib/session';
import { parseBody, signInSchema } from '@/lib/validation';
import {
  checkLimit,
  consumeAttempt,
  formatRetryAfter,
  getClientIp,
  resetRateLimit,
} from '@/lib/rate-limit';
import { getUserModel } from '@/lib/models';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Per-account limits are deliberately looser than the per-IP ones. They exist
// to stop distributed guessing, not to be the first thing a forgetful user
// hits, and locking an account is a denial of service against its owner.
const MAX_ACCOUNT_ATTEMPTS = 10;
const ACCOUNT_LOCKOUT_MS = 30 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const { data: body, error: invalid } = await parseBody(request, signInSchema);
    if (invalid) return invalid;

    // Already trimmed and lower-cased by the schema.
    const email = body.email;

    // Two independent limits. The IP+email key stops one client hammering one
    // account; the account counter below stops many clients hammering it
    // together, which the IP key cannot see because x-forwarded-for is
    // client-controlled and freely rotated.
    const rateLimitKey = `signin:${getClientIp(request)}:${email}`;
    const ipLimit = await checkLimit(rateLimitKey, MAX_ATTEMPTS, WINDOW_MS);
    if (ipLimit.limited) {
      return NextResponse.json(
        {
          error: `Too many login attempts. Please try again in ${formatRetryAfter(ipLimit.retryAfterMs)}.`,
        },
        { status: 429 }
      );
    }

    const userModelForLock = await getUserModel();
    const lockedAccount = userModelForLock
      ? await userModelForLock
          .findOne({ email })
          .select('loginFailedAttempts loginLockedUntil')
          .lean()
      : null;

    if (lockedAccount?.loginLockedUntil) {
      const remaining = new Date(lockedAccount.loginLockedUntil).getTime() - Date.now();
      if (remaining > 0) {
        return NextResponse.json(
          {
            error: `This account is temporarily locked after repeated failed sign-ins. Try again in ${formatRetryAfter(remaining)}.`,
          },
          { status: 429 }
        );
      }
    }

    let result;
    try {
      result = await signInUser(body);
    } catch (err) {
      await consumeAttempt(rateLimitKey, MAX_ATTEMPTS, WINDOW_MS);

      if (userModelForLock) {
        // Scoped to an existing account: incrementing on unknown addresses
        // would turn this into a way to probe which emails are registered.
        const updated = await userModelForLock
          .findOneAndUpdate({ email }, { $inc: { loginFailedAttempts: 1 } }, { new: true })
          .select('loginFailedAttempts')
          .lean();

        if (updated && (updated.loginFailedAttempts ?? 0) >= MAX_ACCOUNT_ATTEMPTS) {
          await userModelForLock.updateOne(
            { email },
            {
              $set: { loginLockedUntil: new Date(Date.now() + ACCOUNT_LOCKOUT_MS) },
              loginFailedAttempts: 0,
            }
          );
        }
      }
      throw err;
    }

    await resetRateLimit(rateLimitKey);
    if (userModelForLock) {
      await userModelForLock.updateOne(
        { email },
        { $set: { loginFailedAttempts: 0, loginLockedUntil: null } }
      );
    }

    // The password step now ends here for everyone, with an ordinary session.
    //
    // It used to fork: an account with a PIN got a short-lived pending token
    // instead of a session and had to clear the PIN before anything existed to
    // hold. That put the second factor in front of the whole site, including
    // pages that hold nothing worth protecting, and it meant a half-signed-in
    // state with its own expiry to explain.
    //
    // The PIN now guards the thing actually worth guarding: the dashboard
    // asks for it on arrival, and until it is answered no balance, position or
    // deposit is fetched, never mind rendered. What a session alone buys you
    // is your own name, the ability to set a first PIN, and the ability to
    // sign out. See src/lib/dashboard-unlock.ts.
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
