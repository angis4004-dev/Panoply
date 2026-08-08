import { NextResponse } from 'next/server';
import { signInUser } from '@/lib/auth-store';
import { setCookie, createPendingPinToken } from '@/lib/session';
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

    // For an account that has a PIN, the password alone still produces no
    // session - only a short-lived token whose sole use is the PIN endpoints,
    // so a stolen password cannot reach the dashboard on its own.
    //
    // For an account that has no PIN yet, sign-in completes normally. It used
    // to divert into a "choose a PIN" step here, which meant the only way to
    // reach the app was to invent a second secret on the spot; setting one now
    // lives in the dashboard, where it can be explained and returned to. The
    // dashboard prompts persistently until it is done.
    const userModel = await getUserModel();
    if (userModel) {
      const record = await userModel.findById(result.user.id).select('pinHash').lean();

      if (record?.pinHash) {
        return NextResponse.json({
          pinRequired: true,
          pendingToken: createPendingPinToken(result.user.id),
          user: { name: result.user.name },
        });
      }
    }

    // Reached by two kinds of caller now:
    //
    //   - a Mongo account with no PIN set yet, which signs in on the password
    //     alone and is prompted to choose a PIN once inside the dashboard;
    //   - the JSON-file fallback store, which has no schema to hold a PIN at
    //     all, so this is the only path it ever takes.
    //
    // Both end the same way: a normal session.
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
