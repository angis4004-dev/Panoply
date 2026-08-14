import { NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { createDashboardUnlockToken } from '@/lib/dashboard-unlock';
import { hashPin, isValidPinFormat, isWeakPin, PIN_LENGTH } from '@/lib/pin';
import { notifySecurityEvent } from '@/lib/notifications';
import { parseBody, pinSetSchema } from '@/lib/validation';

/**
 * POST /api/auth/pin/set - Chooses a PIN for an account that has none.
 *
 * Authenticated by the session, not by a pending sign-in token. Setting a PIN
 * used to be a step wedged into sign-in, so the only credential available at
 * that point was the short-lived token from the password check; now it happens
 * in the dashboard, where the caller is simply signed in.
 *
 * Still refuses to overwrite an existing PIN. Replacing one is
 * POST /api/auth/pin/change, which demands the current PIN - without that
 * split, anyone holding a live session could silently swap out the second
 * factor without knowing the old one.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { data: body, error: invalid } = await parseBody(request, pinSetSchema);
    if (invalid) return invalid;
    const { pin, confirmPin } = body;

    if (!isValidPinFormat(pin)) {
      return NextResponse.json(
        { error: `Your PIN must be exactly ${PIN_LENGTH} digits.` },
        { status: 400 }
      );
    }

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

    const user = await userModel.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.pinHash) {
      return NextResponse.json(
        { error: 'This account already has a PIN. Use Change PIN instead.' },
        { status: 409 }
      );
    }

    user.pinHash = hashPin(pin);
    user.pinSetAt = new Date();
    user.pinFailedAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();

    await notifySecurityEvent(
      user._id.toString(),
      'Sign-in PIN enabled',
      'A PIN is now required in addition to your password when you sign in.'
    );

    // No cookie work here. The caller already holds a valid session and
    // tokenVersion is untouched, so nothing about their sign-in state changes:
    // they have simply added a factor they will be asked for next time.
    //
    // An unlock token comes back because this is reached from inside the
    // dashboard gate: someone who has just chosen a PIN has demonstrably
    // supplied it, and asking them to type it straight back would be a
    // confirmation step they already completed on the previous field.
    return NextResponse.json({
      message: 'PIN set.',
      unlockToken: createDashboardUnlockToken(session.user.id, session.user.tokenVersion),
    });
  } catch (error) {
    console.error('Error setting PIN:', error);
    return NextResponse.json({ error: 'Unable to set your PIN right now.' }, { status: 500 });
  }
}
