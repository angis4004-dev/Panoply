import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/auth-store';
import { sendEmail } from '@/lib/email';
import { renderEmail } from '@/lib/email-template';
import { forgotPasswordSchema, parseBody } from '@/lib/validation';

// Always return this exact message, whether or not the email has an account,
// so this endpoint can't be used to enumerate registered users.
const GENERIC_MESSAGE = 'If an account exists for that email, a reset link has been sent.';

export async function POST(request: Request) {
  try {
    const { data: body, error: invalid } = await parseBody(request, forgotPasswordSchema);
    if (invalid) return invalid;
    const email = body.email;

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
