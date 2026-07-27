import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';

/**
 * Verify that the request has a valid admin session
 * Returns null if authorized, or a NextResponse error if not
 */
export async function verifyAdminAccess(request: NextRequest) {
  // Get session from request
  const session = await getSessionFromRequest(request);

  // Check if session exists
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized - No session found' }, { status: 401 });
  }

  // Check if user is authenticated
  if (!session.user) {
    return NextResponse.json({ error: 'Unauthorized - Invalid session' }, { status: 401 });
  }

  // Check if user has admin role
  if (session.user.role !== 'Admin') {
    return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
  }

  // Authorized
  return null;
}
