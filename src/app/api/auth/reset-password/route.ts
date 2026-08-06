import { NextResponse } from 'next/server';
import { resetPassword } from '@/lib/auth-store';
import { parseBody, resetPasswordSchema } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const { data: body, error: invalid } = await parseBody(request, resetPasswordSchema);
    if (invalid) return invalid;

    await resetPassword(body.token, body.password);

    return NextResponse.json({ message: 'Password updated. You can now sign in.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to reset password.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
