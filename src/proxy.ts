import { NextResponse, type NextRequest } from 'next/server';
import { getSessionFromRequest } from './lib/session';

export async function proxy(request: NextRequest) {
  const { pathname, host } = request.nextUrl;
  const hostname = host.split(':')[0];

  // Determine the destination pathname after applying host-based rewrites
  let destinationPathname = pathname;
  if (pathname === '/') {
    if (
      hostname === 'admin.localhost' ||
      hostname.startsWith('admin.') ||
      hostname === 'dashboard.localhost' ||
      hostname === 'app.localhost' ||
      hostname.startsWith('dashboard.') ||
      hostname.startsWith('app.')
    ) {
      if (hostname === 'admin.localhost' || hostname.startsWith('admin.')) {
        destinationPathname = '/admin';
      } else {
        destinationPathname = '/dashboard';
      }
    }
  }

  // Define protected paths
  const isProtectedPath =
    destinationPathname.startsWith('/admin') || destinationPathname.startsWith('/dashboard');

  // Paths that should never require authentication (even if they match protected prefixes)
  const publicPaths = [
    '/sign-up-login-screen',
    '/api/', // We'll adjust this to check prefix
  ];

  // Check if the path is public (exact match or prefix for API)
  const isPublicPath =
    publicPaths.some((path) => destinationPathname === path) ||
    destinationPathname.startsWith('/api/');

  // If the path is protected and not public, check authentication
  if (isProtectedPath && !isPublicPath) {
    const session = await getSessionFromRequest(request);
    const isAuthenticated = !!session?.user;

    if (!isAuthenticated) {
      // Redirect to sign-in page
      const url = request.nextUrl.clone();
      url.pathname = '/sign-up-login-screen';
      return NextResponse.redirect(url);
    }

    // Additional role checking for admin routes
    if (destinationPathname.startsWith('/admin') && session?.user?.role !== 'Admin') {
      // Redirect to dashboard if not admin
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  // Apply the original host-based rewriting logic
  if ((hostname === 'admin.localhost' || hostname.startsWith('admin.')) && pathname === '/') {
    return NextResponse.rewrite(new URL('/admin', request.url));
  }

  if (
    (hostname === 'dashboard.localhost' ||
      hostname === 'app.localhost' ||
      hostname.startsWith('dashboard.') ||
      hostname.startsWith('app.')) &&
    pathname === '/'
  ) {
    return NextResponse.rewrite(new URL('/dashboard', request.url));
  }

  // For all other requests, continue without modification
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api/auth/* (auth API routes)
     * - /_next/* (next.js internals)
     * - /favicon.ico (favicon)
     * - /public/* (public static files)
     */
    '/((?!api|_next|favicon.ico|public).*)',
  ],
};
