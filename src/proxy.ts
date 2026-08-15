import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { getSessionFromRequest } from './lib/session';
import { routing, locales } from './i18n/routing';
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

/**
 * Locale negotiation for the trader application, and only for it.
 *
 * Created once at module scope rather than per request - it compiles a matcher
 * from the locale list, and rebuilding that on every request would be work
 * repeated for no reason.
 */
const intlMiddleware = createIntlMiddleware(routing);

/** `/es/dashboard` and `/dashboard` are the same route to the rules below. */
const LOCALE_PREFIX = new RegExp(`^/(${locales.join('|')})(?=/|$)`);

function withoutLocale(pathname: string): string {
  return pathname.replace(LOCALE_PREFIX, '') || '/';
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
  //
  // Checked against the un-prefixed path, so /es/admin is refused exactly like
  // /admin. A locale prefix must never become a way around a host rule.
  const route = withoutLocale(pathname);
  if (isAdminPath(route)) {
    return notFound();
  }

  /*
   * The session check runs before locale negotiation, and redirects back into
   * the locale the user was already in.
   *
   * Doing it the other way round would send a French visitor to the English
   * sign-in page, because next-intl would have rewritten the URL by then and
   * the language they chose would be lost at exactly the moment they are being
   * asked to prove who they are.
   */
  if (route.startsWith('/dashboard')) {
    const session = await getSessionFromRequest(request);
    if (!session) {
      const prefix = pathname.match(LOCALE_PREFIX)?.[0] ?? '';
      const url = request.nextUrl.clone();
      url.pathname = `${prefix}/sign-up-login-screen`;
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  /*
   * API routes carry no locale. They return data and machine-readable error
   * codes, not prose, and rewriting /api/prices to /en/api/prices would break
   * every fetch in the application.
   */
  if (route.startsWith('/api/') || isInfrastructurePath(route)) {
    return NextResponse.next();
  }

  // Everything else is a page: negotiate the locale, set the cookie, and
  // rewrite to the [locale] segment.
  const response = intlMiddleware(request);

  /*
   * Tell every cache that this response is language-dependent.
   *
   * What comes back for "/" depends on the visitor's Accept-Language and their
   * NEXT_LOCALE cookie: a US reader gets English, a Japanese reader gets a
   * redirect to /ja. Without Vary, any shared cache is entitled to store the
   * first of those and hand it to the next person - which is how a reader in
   * Kansas ends up looking at Japanese.
   *
   * next-intl issues its redirects as 307, which is not cacheable unless a
   * response explicitly says otherwise, so nothing is broken today. This is
   * the guard for the day someone puts a CDN rule or s-maxage in front of the
   * site and quietly removes that protection.
   */
  const vary = response.headers.get('Vary');
  const needed = ['Accept-Language', 'Cookie'];
  const present = new Set(
    (vary ?? '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  );
  const merged = [
    ...(vary ? [vary] : []),
    ...needed.filter((header) => !present.has(header.toLowerCase())),
  ].join(', ');
  if (merged) response.headers.set('Vary', merged);

  return response;
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
