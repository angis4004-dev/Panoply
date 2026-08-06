import { NextResponse } from 'next/server';
import { verifyEmailToken } from '@/lib/auth-store';
import { grantAchievement } from '@/lib/achievements/engine';
import { parseBody, verifyEmailSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const { data: body, error: invalid } = await parseBody(request, verifyEmailSchema);
    if (invalid) return invalid;

    const result = await verifyEmailToken(body.token);
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
