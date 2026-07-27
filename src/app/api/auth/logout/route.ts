import { NextResponse } from 'next/server';
import { clearCookie } from '@/lib/session';

// POST /api/auth/logout - Clears the session cookie server-side
export async function POST() {
  const response = NextResponse.json({ success: true });
  return clearCookie(response);
}
