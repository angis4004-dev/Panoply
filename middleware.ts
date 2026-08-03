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
  /**
   * Node runtime, not the Edge default.
   *
   * This middleware calls getSessionFromRequest, and src/lib/session.ts signs
   * and verifies cookies with Node's `crypto` - createHmac and, importantly,
   * timingSafeEqual. Neither exists on the Edge runtime. `next dev` runs
   * middleware in a Node-ish sandbox so it passed locally, and the webpack
   * build only warned, which is why this went unnoticed; a deployment to an
   * Edge environment would have failed to verify any session and locked users
   * out of /dashboard. Turbopack promotes the same condition to a build error.
   *
   * The alternative was porting session.ts to Web Crypto, but subtle.sign is
   * async (changing every caller's signature) and there is no Edge equivalent
   * of timingSafeEqual, so a constant-time compare would have to be
   * hand-rolled. Pinning the runtime keeps the audited crypto path intact.
   */
  runtime: 'nodejs',
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
