import { NextResponse } from 'next/server';
import { verifyEmailToken } from '@/lib/auth-store';
import { grantAchievement } from '@/lib/achievements/engine';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = body?.token;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required.' }, { status: 400 });
    }

    const result = await verifyEmailToken(token);
    if (!result) {
      return NextResponse.json(
        { error: 'This verification link is invalid or has expired.' },
        { status: 400 }
      );
    }

    await grantAchievement(result.userId, 'email_verified');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error verifying email:', error);
    return NextResponse.json({ error: 'Failed to verify email.' }, { status: 500 });
  }
}
