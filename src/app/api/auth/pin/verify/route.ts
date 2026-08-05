import { NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { setCookie, verifyPendingPinToken } from '@/lib/session';
import {
  formatLockDuration,
  isValidPinFormat,
  lockRemainingMs,
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
  PIN_LOCKOUT_MS,
  verifyPin,
} from '@/lib/pin';

/**
 * POST /api/auth/pin/verify - Exchanges a correct PIN for a session.
 *
 * The lockout is the security control here, not the PIN. Six digits is a
 * million combinations, which is nothing to an unthrottled attacker, so the
 * attempt counter is persisted on the user document: it survives a restart and
 * is shared by every server instance, unlike the in-memory limiter guarding
 * password login.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pendingToken, pin } = body ?? {};

    const userId = verifyPendingPinToken(pendingToken);
    if (!userId) {
      return NextResponse.json(
        { error: 'Your sign-in attempt expired. Please enter your password again.' },
        { status: 401 }
      );
    }

    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const user = await userModel.findById(userId);
    if (!user || !user.pinHash) {
      return NextResponse.json({ error: 'No PIN is set for this account.' }, { status: 400 });
    }

    // Checked before the PIN is even compared, so a locked account costs an
    // attacker a request without giving them an oracle.
    const remaining = lockRemainingMs(user);
    if (remaining > 0) {
      return NextResponse.json(
        {
          error: `Too many incorrect attempts. Try again in ${formatLockDuration(remaining)}.`,
          lockedUntil: user.pinLockedUntil,
        },
        { status: 429 }
      );
    }

    if (!isValidPinFormat(pin)) {
      return NextResponse.json(
        { error: `Your PIN must be exactly ${PIN_LENGTH} digits.` },
        { status: 400 }
      );
    }

    if (!verifyPin(pin, user.pinHash)) {
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
          error: `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} remaining.`,
          attemptsRemaining: left,
        },
        { status: 401 }
      );
    }

    user.pinFailedAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();

    const response = NextResponse.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        kycStatus: user.kycStatus || 'unverified',
      },
    });

    return setCookie(response, {
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        tokenVersion: user.tokenVersion ?? 0,
      },
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error('Error verifying PIN:', error);
    return NextResponse.json({ error: 'Unable to verify your PIN right now.' }, { status: 500 });
  }
}
