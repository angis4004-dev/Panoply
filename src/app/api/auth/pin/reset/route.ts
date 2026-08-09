import { NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { hashPin, isWeakPin } from '@/lib/pin';
import { notifySecurityEvent } from '@/lib/notifications';
import { parseBody, pinResetSchema } from '@/lib/validation';

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

    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const user = await userModel.findOne({
      pinResetToken: token,
      pinResetExpires: { $gt: new Date() },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'This link is invalid or has expired. Request a new one.' },
        { status: 400 }
      );
    }

    user.pinHash = hashPin(pin);
    user.pinSetAt = new Date();
    // The whole reason someone reaches this page is usually that they burned
    // through their attempts, so leaving the lock in place would send them
    // straight back to a wall with a PIN they now know.
    user.pinFailedAttempts = 0;
    user.pinLockedUntil = null;
    user.pinResetToken = undefined;
    user.pinResetExpires = undefined;
    // Recovering a second factor is a plausible response to losing control of
    // the account, so every session minted before now is dropped.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

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
