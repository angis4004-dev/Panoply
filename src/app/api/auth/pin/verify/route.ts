import { NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { createDashboardUnlockToken } from '@/lib/dashboard-unlock';
import {
  formatLockDuration,
  isValidPinFormat,
  lockRemainingMs,
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
  PIN_LOCKOUT_MS,
  verifyPin,
} from '@/lib/pin';
import { parseBody, pinVerifySchema } from '@/lib/validation';
import { recordFailedPinAttempt } from '@/lib/pin-attempts';

/**
 * POST /api/auth/pin/verify - Clears the PIN gate in front of the dashboard.
 *
 * Authenticated by the session. This used to take a short-lived token from the
 * password step and hand back a session; now the session already exists and
 * what comes back is an unlock token, which the dashboard holds in memory and
 * sends on every data request. See src/lib/dashboard-unlock.ts.
 *
 * The lockout is the security control here, not the PIN. Six digits is a
 * million combinations, which is nothing to an unthrottled attacker, so the
 * attempt counter is persisted on the user document: it survives a restart and
 * is shared by every server instance, unlike the in-memory limiter guarding
 * password login.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { data: body, error: invalid } = await parseBody(request, pinVerifySchema);
    if (invalid) return invalid;
    const { pin } = body;

    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const userId = session.user.id;
    const user = await userModel.findById(userId);
    if (!user || !user.pinHash) {
      return NextResponse.json(
        { error: 'No PIN is set for this account.', code: 'pin_not_set' },
        { status: 400 }
      );
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
      const updated = await recordFailedPinAttempt(userModel, userId);
      if (!updated || updated.pinLockedUntil) {
        return NextResponse.json(
          {
            error: `Too many incorrect attempts. Try again in ${formatLockDuration(PIN_LOCKOUT_MS)}.`,
          },
          { status: 429 }
        );
      }

      const left = MAX_PIN_ATTEMPTS - (updated.pinFailedAttempts ?? 0);
      return NextResponse.json(
        {
          error: `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} remaining.`,
          attemptsRemaining: left,
        },
        { status: 401 }
      );
    }

    await userModel.findByIdAndUpdate(userId, {
      $set: { pinFailedAttempts: 0, pinLockedUntil: null },
    });

    // Bound to the tokenVersion the session carries, so signing out or
    // resetting the password invalidates the unlock along with the session.
    return NextResponse.json({
      unlockToken: createDashboardUnlockToken(userId, session.user.tokenVersion),
    });
  } catch (error) {
    console.error('Error verifying PIN:', error);
    return NextResponse.json({ error: 'Unable to verify your PIN right now.' }, { status: 500 });
  }
}
