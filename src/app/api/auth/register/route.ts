import { NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth-store';
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
    const message = error instanceof Error ? error.message : 'Unable to create account.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
