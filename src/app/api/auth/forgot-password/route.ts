import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/auth-store';
import { sendEmail } from '@/lib/email';
import { renderEmail } from '@/lib/email-template';
import { forgotPasswordSchema, parseBody } from '@/lib/validation';
import { consumeAttempt, getClientIp } from '@/lib/rate-limit';
import {
  RECOVERY_REQUEST_MAX_PER_IP,
  RECOVERY_REQUEST_MAX_PER_RECIPIENT,
  RECOVERY_REQUEST_WINDOW_MS,
  rateLimitKeys,
  tooManyRequests,
} from '@/lib/auth-rate-limits';

// Always return this exact message, whether or not the email has an account,
// so this endpoint can't be used to enumerate registered users.
const GENERIC_MESSAGE = 'If an account exists for that email, a reset link has been sent.';

export async function POST(request: Request) {
  try {
    const { data: body, error: invalid } = await parseBody(request, forgotPasswordSchema);
    if (invalid) return invalid;
    const email = body.email;

    /*
     * Counted before we know whether the account exists, and counted on every
     * call rather than only on the ones that send mail.
     *
     * That ordering is the whole enumeration defence. If the limiter only
     * advanced when an email was actually sent, then running the same address
     * past the limit would return 429 for a registered address and 200 for an
     * unregistered one - handing back exactly the distinction GENERIC_MESSAGE
     * exists to hide. Counting unconditionally means the 429 describes the
     * caller's own request rate and nothing about the account.
     *
     * The recipient limit is the one that matters. It is what stops this
     * endpoint being used to bury somebody's inbox, and unlike the IP it
     * cannot be rotated: to send a fourth email to an address you must wait,
     * whatever address you send it from.
     */
    const ipLimit = await consumeAttempt(
      rateLimitKeys.forgotPasswordIp(getClientIp(request)),
      RECOVERY_REQUEST_MAX_PER_IP,
      RECOVERY_REQUEST_WINDOW_MS
    );
    if (ipLimit.limited) {
      return tooManyRequests('Too many password reset requests.', ipLimit.retryAfterMs);
    }

    const recipientLimit = await consumeAttempt(
      rateLimitKeys.forgotPasswordRecipient(email),
      RECOVERY_REQUEST_MAX_PER_RECIPIENT,
      RECOVERY_REQUEST_WINDOW_MS
    );
    if (recipientLimit.limited) {
      return tooManyRequests(
        'A reset link has already been sent to that address.',
        recipientLimit.retryAfterMs
      );
    }

    const token = await requestPasswordReset(email);

    if (token) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4028';
      const resetLink = `${appUrl}/reset-password?token=${token}`;

      await sendEmail({
        to: email,
        subject: 'Reset your Panoply password',
        html: renderEmail({
          eyebrow: 'Account access',
          title: 'Reset your password',
          preheader: 'Your reset link works once and expires in an hour.',
          paragraphs: ['Someone asked to reset the password on your Panoply account.'],
          action: { label: 'Choose a new password', url: resetLink },
          actionNote: 'Works once. Expires in one hour.',
          // Reassurance, not a warning, so it is a quiet line rather than an
          // amber box. And phrased as "nothing has happened" rather than
          // "ignore this": an unexpected reset email is alarming, and the
          // useful fact is that the account is untouched until the link is used.
          footnote:
            "Didn't ask for this? Nothing has changed. Your password stays as it is unless the link above is used.",
        }),
      });
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error('Error in forgot-password route:', error);
    // Still return the generic message on unexpected errors, for the same
    // enumeration-prevention reason, but log server-side for diagnosis.
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }
}
