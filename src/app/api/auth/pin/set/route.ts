import { NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { setCookie, verifyPendingPinToken } from '@/lib/session';
import { hashPin, isValidPinFormat, isWeakPin, PIN_LENGTH } from '@/lib/pin';

/**
 * POST /api/auth/pin/set - Sets a PIN for an account that has none, and
 * completes sign-in.
 *
 * Reachable only with a pending token, so a caller must already have proven
 * the password. Refuses to overwrite an existing PIN: changing one is a
 * different operation with different requirements (it should demand the
 * current PIN), and allowing it here would let anyone holding a password
 * silently replace the second factor.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pendingToken, pin, confirmPin } = body ?? {};

    const userId = verifyPendingPinToken(pendingToken);
    if (!userId) {
      return NextResponse.json(
        { error: 'Your sign-in attempt expired. Please enter your password again.' },
        { status: 401 }
      );
    }

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

    const user = await userModel.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.pinHash) {
      return NextResponse.json(
        { error: 'This account already has a PIN. Enter it to continue.' },
        { status: 409 }
      );
    }

    user.pinHash = hashPin(pin);
    user.pinSetAt = new Date();
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
    console.error('Error setting PIN:', error);
    return NextResponse.json({ error: 'Unable to set your PIN right now.' }, { status: 500 });
  }
}
