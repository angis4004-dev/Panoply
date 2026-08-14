import { NextResponse } from 'next/server';
import { registerUser, requestEmailVerification } from '@/lib/auth-store';
import { sendEmail } from '@/lib/email';
import { grantAchievement } from '@/lib/achievements/engine';
import { setCookie } from '@/lib/session';
import { parseBody, registerSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const { data: body, error: invalid } = await parseBody(request, registerSchema);
    if (invalid) return invalid;

    const result = await registerUser(body);

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
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Verify your email</h2>
            <p>Welcome to Panoply. Confirm your email address to finish setting up your account.</p>
            <p>
              <a href="${verifyLink}" style="display:inline-block;padding:12px 20px;background:#1E63FF;color:#F2F5FA;text-decoration:none;border-radius:8px;font-weight:600;">
                Verify Email
              </a>
            </p>
            <p>This link expires in 24 hours.</p>
          </div>
        `,
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
