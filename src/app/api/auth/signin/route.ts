import { NextResponse } from 'next/server';
import { signInUser } from '@/lib/auth-store';
import type { LoginPayload } from '@/types/auth';
import { setCookie } from '@/lib/session';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginPayload;

    if (!body?.email || !body?.password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const result = await signInUser(body);

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
    const message = error instanceof Error ? error.message : 'Unable to sign in.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
