import { NextResponse } from 'next/server';
import { registerUser, requestEmailVerification } from '@/lib/auth-store';
import { sendEmail } from '@/lib/email';
import { grantAchievement } from '@/lib/achievements/engine';
import type { RegisterPayload } from '@/types/auth';
import { setCookie } from '@/lib/session';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterPayload;

    if (!body?.email || !body?.password || !body?.fullName) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }

    if (body.password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

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
        subject: 'Verify your Aegis email address',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Verify your email</h2>
            <p>Welcome to Aegis. Confirm your email address to finish setting up your account.</p>
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

    // Create session data
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

    // Create response and set session cookie
    const response = NextResponse.json({
      user: result.user,
      // Note: token is kept for backward compatibility but not used
      token: result.token,
    });

    // Set the session cookie
    return setCookie(response, sessionData);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
