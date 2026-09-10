import { NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { hashPin, isWeakPin } from '@/lib/pin';
import { notifySecurityEvent } from '@/lib/notifications';
import { parseBody, pinResetSchema } from '@/lib/validation';
import { checkLimit, consumeAttempt, getClientIp } from '@/lib/rate-limit';
import {
  RECOVERY_REDEEM_MAX_PER_IP,
  RECOVERY_REDEEM_WINDOW_MS,
  rateLimitKeys,
  tooManyRequests,
} from '@/lib/auth-rate-limits';

/**
 * POST /api/auth/pin/reset - Completes the forgotten-PIN flow.
 *
 * Sets the new PIN and clears the lock, but issues no session. That is the
 * point: the link travels by email, and if following it also signed you in,
 * then read access to the inbox alone would be enough to take the account -
 * the password would have stopped mattering. Instead the user goes back to
 * sign-in and enters password plus the PIN they just chose, so both secrets
 * are still required. This mirrors POST /api/auth/reset-password, which
 * likewise ends at "you can now sign in" rather than at a session.
 *
 * The token is single-use: cleared here, and also cleared by /pin/change, so a
 * link that arrives after the user has already sorted the PIN out another way
 * cannot overwrite it.
 */
export async function POST(request: Request) {
  try {
    const { data: body, error: invalid } = await parseBody(request, pinResetSchema);
    if (invalid) return invalid;
    const { token, pin, confirmPin } = body;

    if (pin !== confirmPin) {
      return NextResponse.json({ error: 'The two PINs do not match.' }, { status: 400 });
    }

    if (isWeakPin(pin)) {
      return NextResponse.json(
        { error: 'Choose a less predictable PIN - avoid repeated digits and simple sequences.' },
        { status: 400 }
      );
    }

    /*
     * Checked after the PIN itself has been validated, so that mistyping the
     * confirmation or picking 111111 costs nothing. Those are the user's own
     * form errors and have no bearing on whether the token is being guessed;
     * only the token lookup below advances the counter.
     */
    const key = rateLimitKeys.pinResetIp(getClientIp(request));
    const limit = await checkLimit(key, RECOVERY_REDEEM_MAX_PER_IP, RECOVERY_REDEEM_WINDOW_MS, {
      whenUnavailable: 'deny',
    });
    if (limit.limited) {
      return tooManyRequests('Too many failed PIN reset attempts.', limit.retryAfterMs);
    }

    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const user = await userModel.findOneAndUpdate(
      {
        pinResetToken: token,
        pinResetExpires: { $gt: new Date() },
      },
      [
        {
          $set: {
            pinHash: hashPin(pin),
            pinSetAt: new Date(),
            pinFailedAttempts: 0,
            pinLockedUntil: null,
            tokenVersion: { $add: [{ $ifNull: ['$tokenVersion', 0] }, 1] },
          },
        },
        { $unset: ['pinResetToken', 'pinResetExpires'] },
      ],
      { new: true, updatePipeline: true }
    );
    if (!user) {
      await consumeAttempt(key, RECOVERY_REDEEM_MAX_PER_IP, RECOVERY_REDEEM_WINDOW_MS);
      return NextResponse.json(
        { error: 'This link is invalid or has expired. Request a new one.' },
        { status: 400 }
      );
    }

    await notifySecurityEvent(
      user._id.toString(),
      'Your PIN was reset',
      'Your sign-in PIN was reset using an emailed recovery link, and all sessions were signed out. If this was not you, reset your password immediately.'
    );

    return NextResponse.json({ message: 'PIN updated. You can now sign in.' });
  } catch (error) {
    console.error('Error resetting PIN:', error);
    return NextResponse.json({ error: 'Unable to reset your PIN right now.' }, { status: 500 });
  }
}
