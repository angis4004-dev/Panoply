import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/auth-store';
import { sendEmail } from '@/lib/email';

// Always return this exact message, whether or not the email has an account,
// so this endpoint can't be used to enumerate registered users.
const GENERIC_MESSAGE = 'If an account exists for that email, a reset link has been sent.';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = body?.email;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const token = await requestPasswordReset(email);

    if (token) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4028';
      const resetLink = `${appUrl}/reset-password?token=${token}`;

      await sendEmail({
        to: email,
        subject: 'Reset your Aegis password',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Reset your password</h2>
            <p>We received a request to reset the password for your Aegis account.</p>
            <p>
              <a href="${resetLink}" style="display:inline-block;padding:12px 20px;background:#243B8F;color:#FFF0C9;text-decoration:none;border-radius:8px;font-weight:600;">
                Reset Password
              </a>
            </p>
            <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
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
