import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';

// GET /api/auth/session - Returns the current user from the session cookie, or null
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      email: session.user.email,
      role: session.user.role,
      name: session.user.name,
    },
  });
}
