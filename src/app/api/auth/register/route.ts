import { NextResponse } from 'next/server';
import { registerUser, requestEmailVerification } from '@/lib/auth-store';
import { sendEmail } from '@/lib/email';
import { renderEmail } from '@/lib/email-template';
import { grantAchievement } from '@/lib/achievements/engine';
import { setCookie } from '@/lib/session';
import { parseBody, registerSchema } from '@/lib/validation';
import { alertOps } from '@/lib/ops-alerts';
import { checkLimit, consumeAttempt, getClientIp } from '@/lib/rate-limit';
import {
  SIGNUP_MAX_PER_IP,
  SIGNUP_WINDOW_MS,
  rateLimitKeys,
  tooManyRequests,
} from '@/lib/auth-rate-limits';

export async function POST(request: Request) {
  try {
    const { data: body, error: invalid } = await parseBody(request, registerSchema);
    if (invalid) return invalid;

    /*
     * Per client, checked now and counted only once an account exists.
     *
     * Skipped when the address is unknown. getClientIp returns the literal
     * 'unknown' without an x-forwarded-for header, and every visitor would
     * then share one bucket - three sign-ups an hour for the whole site.
     */
    const ip = getClientIp(request);
    const signupKey = ip === 'unknown' ? null : rateLimitKeys.signupIp(ip);
    if (!signupKey) {
      console.warn('Sign-up limit skipped: no client IP on the request.');
    } else {
      const limit = await checkLimit(signupKey, SIGNUP_MAX_PER_IP, SIGNUP_WINDOW_MS);
      if (limit.limited) {
        return tooManyRequests(
          'Too many accounts created from this connection.',
          limit.retryAfterMs
        );
      }
    }

    const result = await registerUser(body);
    if (signupKey) await consumeAttempt(signupKey, SIGNUP_MAX_PER_IP, SIGNUP_WINDOW_MS);

    void alertOps({
      type: 'signup',
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
    });

    await grantAchievement(result.user.id, 'welcome_to_aegis').catch((err) => {
      console.error('Failed to grant welcome_to_aegis achievement:', err);
    });

    const verificationToken = await requestEmailVerification(result.user.id).catch((err) => {
      console.error('Failed to create email verification token:', err);
      return null;
    });

    if (verificationToken) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4028';
      const verifyLink = `${appUrl}/verify-email?token=${verificationToken}`;
      await sendEmail({
        to: result.user.email,
        subject: 'Verify your Panoply email address',
        // Two paragraphs became one, and the second - a paragraph explaining
        // the PIN - was cut entirely. It was an instruction in an email whose
        // only job is a single click, and instructions in email do not get
        // read. The dashboard prompts for a PIN at the right moment anyway.
        html: renderEmail({
          eyebrow: 'Welcome',
          title: 'One click to finish',
          preheader: 'Confirm your email address to activate your account.',
          paragraphs: [
            'Your Panoply account is created. Confirming your address is the last step, and it is how we reach you about deposits and verification.',
          ],
          action: { label: 'Verify my email', url: verifyLink },
          actionNote: 'Expires in 24 hours.',
        }),
      }).catch((err) => {
        console.error('Failed to send verification email:', err);
      });
    }

    // Registration signs the user in. Choosing a PIN is not part of this flow:
    // it happens in the dashboard, from Settings > Security, prompted by a
    // banner on the overview page.
    //
    // This is a deliberate trade. Interrupting sign-up to demand a second
    // secret costs completed registrations, and the person choosing it has
    // just created the password moments earlier, so the PIN adds nothing
    // against them at that instant. What it does mean is that an account
    // exists with a session and no second factor until the prompt is
    // answered - which is why the prompt is persistent rather than
    // dismissible, and why every sensitive action stays gated server-side
    // regardless of PIN state.
    const sessionData = {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        createdAt:
          typeof result.user.createdAt === 'string'
            ? result.user.createdAt
            : (result.user.createdAt as Date).toISOString(),
        // A freshly created account has never been revoked.
        tokenVersion: 0,
      },
      createdAt: Date.now(),
    };

    const response = NextResponse.json({
      user: result.user,
      // Note: token is kept for backward compatibility but not used
      token: result.token,
    });

    return setCookie(response, sessionData);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
