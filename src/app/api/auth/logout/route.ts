import { NextResponse } from 'next/server';
import { clearCookie, getSessionFromRequest, revokeUserSessions } from '@/lib/session';

// POST /api/auth/logout - Ends the session everywhere, not just in this browser
export async function POST(request: Request) {
  // Clearing the cookie only asks this browser to forget the token; a copy
  // taken beforehand would still have worked until it expired. Bumping
  // tokenVersion invalidates the token itself, so logging out actually logs
  // out - including on any other device holding the same session.
  const session = await getSessionFromRequest(request);
  if (session) {
    await revokeUserSessions(session.user.id);
  }

  const response = NextResponse.json({ success: true });
  return clearCookie(response);
}
