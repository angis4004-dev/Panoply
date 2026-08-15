import { NextResponse, type NextRequest } from 'next/server';
import { getSessionFromRequest } from './lib/session';
import {
  classifyHost,
  hostConfigFromEnv,
  isAdminHostConfigured,
  isAdminPath,
  isInfrastructurePath,
} from './lib/admin/host';
import { readAdminToken } from './lib/admin/cookie';

/**
 * Which application answers this request.
 *
 * Two surfaces share one deployment, and the Host header is what separates
 * them:
 *
 *   admin.example.com  the operations console. Serves /admin and /api/admin,
 *                      and nothing else. Every response carries the console's
 *                      security headers.
 *   app.example.com    the trader application. /admin and /api/admin do not
 *                      exist here - they 404, as if the console were a
 *                      different deployment, which from a trader's point of
 *                      view it is.
 *
 * This is routing and defence in depth, not the access control itself. The
 * real gate is requireAdmin in src/lib/admin/guard.ts, which every admin route
 * handler calls and which repeats the host check. Anything that depends on a
 * proxy alone is one matcher edit away from being wrong.
 */

/** Applied to every admin response. */
function applyAdminSecurityHeaders(response: NextResponse, isProduction: boolean): NextResponse {
  const headers = response.headers;

  // Clickjacking. X-Frame-Options for older agents, frame-ancestors for the
  // rest - the CSP directive is the one that is actually respected now, but
  // both cost nothing and the console must never be framable. An admin who can
  // be induced to click inside an invisible frame can authorize a deposit.
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  // no-referrer, not the usual same-origin default: an admin URL can carry a
  // trader id, and that should not travel to any external site an operator
  // opens from the console.
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // Every admin page is account data. A shared cache or a browser back-button
  // restore showing a previous operator's queue is not acceptable here.
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      // Next injects inline bootstrap scripts and styles; 'unsafe-inline' for
      // both is what the framework requires without a nonce pipeline. Scripts
      // are still origin-locked, which is the part that matters against an
      // injected external loader.
      //
      // 'unsafe-eval' in development only: React's dev build uses eval() to
      // reconstruct call stacks, and without it every page logs a CSP
      // violation. It is deliberately absent from the production policy,
      // where React never calls eval.
      `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
      // fonts.googleapis.com is the one third-party origin the console
      // touches, and only because the shared stylesheet imports a webfont for
      // the marketing site. The console itself uses self-hosted next/font
      // faces; this entry exists so the import fails silently rather than
      // logging a violation on every page load, which is how real violations
      // get ignored.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // The KYC document viewer renders an encrypted image served by our own
      // API as a blob, so blob: and data: are needed here and nowhere else.
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self'",
    ].join('; ')
  );

  if (isProduction) {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

function notFound(): NextResponse {
  // Rewriting to the app's own 404 rather than redirecting: a redirect
  // confirms the path means something somewhere.
  return new NextResponse(null, { status: 404 });
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const config = hostConfigFromEnv();
  const surface = classifyHost(request.headers.get('host'), config);
  const isProduction = process.env.NODE_ENV === 'production';

  if (surface === 'admin') {
    // Fail closed. Without ADMIN_HOST the classifier falls back to matching
    // any hostname starting with "admin.", which in production would let a
    // wildcard DNS record serve the console.
    if (isProduction && !isAdminHostConfigured(config)) {
      console.error('ADMIN_HOST is not configured; refusing to serve the admin console.');
      return notFound();
    }

    if (isInfrastructurePath(pathname)) {
      return NextResponse.next();
    }

    // The console's front door. Landing on the bare host should not 404.
    if (pathname === '/') {
      return applyAdminSecurityHeaders(
        NextResponse.redirect(new URL('/admin', request.url)),
        isProduction
      );
    }

    // Nothing but the console is served here. The trader application is not
    // reachable on this hostname at all, so a stolen admin cookie has no
    // trader endpoints to reach and an operator cannot wander into the app
    // while holding admin authority.
    if (!isAdminPath(pathname)) {
      return applyAdminSecurityHeaders(notFound(), isProduction);
    }

    // A cheap presence check so an unauthenticated operator lands on the login
    // form rather than a permission error. It is not authentication - the
    // token is not verified here, only observed. requireAdmin does the real
    // work on every route.
    const isLoginPath = pathname === '/admin/login' || pathname.startsWith('/api/admin/auth/');
    if (
      !isLoginPath &&
      !pathname.startsWith('/api/') &&
      !readAdminToken(request.headers.get('cookie'))
    ) {
      const url = new URL('/admin/login', request.url);
      if (pathname !== '/admin') url.searchParams.set('next', `${pathname}${search}`);
      return applyAdminSecurityHeaders(NextResponse.redirect(url), isProduction);
    }

    return applyAdminSecurityHeaders(NextResponse.next(), isProduction);
  }

  // --- The trader application ---------------------------------------------

  // The console does not exist on this host. Not a redirect to the admin
  // origin: that would advertise where it lives and would carry the requested
  // path across origins.
  const route = pathname;
  if (isAdminPath(route)) {
    return notFound();
  }

  if (route.startsWith('/dashboard')) {
    const session = await getSessionFromRequest(request);
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = '/sign-up-login-screen';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

/*
 * No `runtime` key: a proxy file always runs on Node, and Next 16 rejects the
 * config outright if one is present. That is what this file needs -
 * getSessionFromRequest signs and verifies cookies with Node's `crypto`,
 * including timingSafeEqual, which has no Edge equivalent. Under the old
 * middleware convention this had to be pinned by hand.
 */
export const config = {
  matcher: [
    /*
     * Everything except Next's own static output. API routes are included
     * deliberately: the host rule that makes /api/admin a 404 on the trader
     * origin has to apply to them, and the previous matcher excluded /api
     * entirely.
     */
    '/((?!_next/static|_next/image).*)',
  ],
};
