import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from './src/lib/session';

// Define paths that require authentication
const protectedPaths = ['/dashboard', '/admin'];
// Define paths that require admin role
const adminPaths = ['/admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the path matches any protected routes
  const isProtectedPath = protectedPaths.some((prefix) => pathname.startsWith(prefix));

  if (!isProtectedPath) {
    // Not a protected path, continue with the request
    return NextResponse.next();
  }

  // Get session from request
  const session = await getSessionFromRequest(request);

  // Check if it's a dashboard path
  const isDashboardPath = pathname.startsWith('/dashboard');

  // For dashboard routes: require authentication
  if (isDashboardPath && !session) {
    // No session, redirect to sign-in
    const url = request.nextUrl.clone();
    url.pathname = '/sign-up-login-screen';
    return NextResponse.redirect(url);
  }

  // Check if it's an admin path
  const isAdminPath = adminPaths.some((prefix) => pathname.startsWith(prefix));

  // For admin routes: require admin role
  if (isAdminPath) {
    if (!session) {
      // No session, redirect to sign-in
      const url = request.nextUrl.clone();
      url.pathname = '/sign-up-login-screen';
      return NextResponse.redirect(url);
    }

    if (session.user.role !== 'Admin') {
      // Not an admin, redirect to dashboard
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  // User is authenticated and authorized, continue with the request
  return NextResponse.next();
}

// Configure middleware to run on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api/).*)',
  ],
};
