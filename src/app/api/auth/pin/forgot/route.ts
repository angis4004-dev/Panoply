import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { sendEmail } from '@/lib/email';
import { parseBody, pinForgotSchema } from '@/lib/validation';

/** Matches the password-reset window. */
const PIN_RESET_TTL_MS = 60 * 60 * 1000;

/**
 * POST /api/auth/pin/forgot - Emails a link for choosing a new PIN.
 *
 * Gated on the session, not on an email address. That single choice is what
 * keeps the PIN a real second factor: to get a reset link you must already
 * have cleared the password step, so the link is worth something only to
 * someone who holds the password AND the inbox. An email-addressed version
 * would let anyone spray reset mail at any account, and would reduce recovery
 * of both secrets to "can you read this inbox".
 *
 * A locked account can still request one. The lockout exists to stop guessing,
 * not to strand the account's owner for fifteen minutes, and completing the
 * reset clears the lock.
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { error: invalid } = await parseBody(request, pinForgotSchema);
    if (invalid) return invalid;

    const userId = session.user.id;

    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.pinResetToken = token;
    user.pinResetExpires = new Date(Date.now() + PIN_RESET_TTL_MS);
    await user.save();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4028';
    const resetLink = `${appUrl}/reset-pin?token=${token}`;

    const sent = await sendEmail({
      to: user.email,
      subject: 'Choose a new Panoply PIN',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Choose a new PIN</h2>
          <p>Someone entered your password and asked to reset the 6-digit PIN on your Panoply account.</p>
          <p>
            <a href="${resetLink}" style="display:inline-block;padding:12px 20px;background:#243B8F;color:#FFF0C9;text-decoration:none;border-radius:8px;font-weight:600;">
              Choose a New PIN
            </a>
          </p>
          <p>This link expires in 1 hour and can be used once.</p>
          <p><strong>If this wasn't you, someone knows your password.</strong> Ignore this link and reset your password immediately.</p>
        </div>
      `,
    });

    // The send result is actually checked here, unlike in the password-reset
    // route. There it is swallowed on purpose: that endpoint takes an email
    // address, so reporting success or failure would say whether the address
    // has an account. This one takes a pending token, so the account is
    // already known to the caller and there is nothing left to leak - which
    // means "check your email" would simply be untrue if the send failed, and
    // would leave someone waiting on mail that is never coming.
    if (!sent) {
      // The token was already persisted, so it stays valid; the user just
      // needs the mail to arrive. Nothing to roll back.
      return NextResponse.json(
        { error: 'We could not send the email. Please try again in a moment.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: 'Check your email for a link to choose a new PIN.',
    });
  } catch (error) {
    console.error('Error requesting PIN reset:', error);
    return NextResponse.json({ error: 'Unable to send a reset link right now.' }, { status: 500 });
  }
}
