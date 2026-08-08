import { NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { getSessionFromRequest, setCookie } from '@/lib/session';
import {
  formatLockDuration,
  hashPin,
  isWeakPin,
  lockRemainingMs,
  MAX_PIN_ATTEMPTS,
  PIN_LOCKOUT_MS,
  verifyPin,
} from '@/lib/pin';
import { parseBody, pinChangeSchema } from '@/lib/validation';

/**
 * POST /api/auth/pin/change - Replaces the PIN on a signed-in account.
 *
 * POST /api/auth/pin/set deliberately refuses to overwrite an existing PIN,
 * because doing it there would let anyone holding a password silently replace
 * the second factor. This is the operation it was refusing to be: it demands
 * the current PIN, and it demands a live session.
 *
 * The current-PIN check reuses the same persisted attempt counter and lock as
 * /pin/verify, and that matters more here than it looks. A session cookie is
 * the one thing an attacker might already have without the PIN - a stolen
 * laptop, a hijacked session - and an unthrottled "is this the current PIN?"
 * endpoint behind that cookie would hand them a million-guess oracle against
 * the very secret the PIN exists to protect. Sharing the counter means guesses
 * spent here also lock out the sign-in path, and vice versa.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { data: body, error: invalid } = await parseBody(request, pinChangeSchema);
    if (invalid) return invalid;
    const { currentPin, pin, confirmPin } = body;

    if (pin !== confirmPin) {
      return NextResponse.json({ error: 'The two PINs do not match.' }, { status: 400 });
    }

    if (pin === currentPin) {
      return NextResponse.json(
        { error: 'Your new PIN must be different from your current one.' },
        { status: 400 }
      );
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

    const user = await userModel.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.pinHash) {
      return NextResponse.json(
        { error: 'This account has no PIN yet. Sign out and sign back in to choose one.' },
        { status: 400 }
      );
    }

    // Before the comparison, so a locked account costs a request without
    // revealing anything about the PIN.
    const remaining = lockRemainingMs(user);
    if (remaining > 0) {
      return NextResponse.json(
        { error: `Too many incorrect attempts. Try again in ${formatLockDuration(remaining)}.` },
        { status: 429 }
      );
    }

    if (!verifyPin(currentPin, user.pinHash)) {
      const attempts = (user.pinFailedAttempts ?? 0) + 1;
      user.pinFailedAttempts = attempts;

      if (attempts >= MAX_PIN_ATTEMPTS) {
        user.pinLockedUntil = new Date(Date.now() + PIN_LOCKOUT_MS);
        user.pinFailedAttempts = 0;
        await user.save();
        return NextResponse.json(
          {
            error: `Too many incorrect attempts. Try again in ${formatLockDuration(PIN_LOCKOUT_MS)}.`,
          },
          { status: 429 }
        );
      }

      await user.save();
      const left = MAX_PIN_ATTEMPTS - attempts;
      return NextResponse.json(
        {
          error: `That is not your current PIN. ${left} attempt${left === 1 ? '' : 's'} remaining.`,
          attemptsRemaining: left,
        },
        { status: 401 }
      );
    }

    user.pinHash = hashPin(pin);
    user.pinSetAt = new Date();
    user.pinFailedAttempts = 0;
    user.pinLockedUntil = null;
    // Any half-finished forgotten-PIN link is void the moment a PIN is chosen
    // by other means, otherwise an old email would still overwrite the new PIN.
    user.pinResetToken = undefined;
    user.pinResetExpires = undefined;
    // Changing a second factor should evict anyone else holding a session for
    // this account, which is what the bump does. It would sign this caller out
    // too, so the response re-issues their cookie at the new version - other
    // devices are logged out, this one is not.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    const response = NextResponse.json({ message: 'PIN updated.' });

    return setCookie(response, {
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        tokenVersion: user.tokenVersion,
      },
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error('Error changing PIN:', error);
    return NextResponse.json({ error: 'Unable to change your PIN right now.' }, { status: 500 });
  }
}
