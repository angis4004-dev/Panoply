/**
 * The admin session cookie, as a string.
 *
 * Separate from src/lib/admin/session.ts so that the attributes which enforce
 * subdomain isolation - the name, the absence of a Domain, SameSite, the
 * __Host- prefix - can be asserted directly instead of inferred from a browser
 * round trip.
 *
 * The isolation argument rests on three things:
 *
 * 1. A different name from the trader cookie. Nothing that reads `auth_session`
 *    can be handed an admin token by mistake, and vice versa.
 * 2. No Domain attribute. A cookie set without one is host-only: the browser
 *    sends it to admin.example.com and to nothing else, not to the parent
 *    domain and not to app.example.com. This is why SESSION_COOKIE_DOMAIN,
 *    which the trader cookie may set to a shared parent, is deliberately not
 *    consulted here.
 * 3. The __Host- prefix in production. Browsers refuse to accept a cookie with
 *    that prefix unless it is Secure, Path=/, and has no Domain - so a future
 *    change that adds a Domain does not silently widen the cookie's scope, it
 *    breaks sign-in immediately and visibly.
 */

const BASE_NAME = 'aegis_admin_session';

/**
 * __Host- only where it can work. It requires Secure, and http://admin.localhost
 * is not universally treated as a secure context, so development uses the bare
 * name. Both names are distinct from the trader cookie, which is the property
 * that matters in either environment.
 */
export function adminCookieName(nodeEnv: string | undefined = process.env.NODE_ENV): string {
  return nodeEnv === 'production' ? `__Host-${BASE_NAME}` : BASE_NAME;
}

export interface CookieOptions {
  maxAgeSeconds: number;
  nodeEnv?: string;
}

export function serializeAdminCookie(token: string, options: CookieOptions): string {
  const secure = options.nodeEnv === 'production';
  return [
    `${adminCookieName(options.nodeEnv)}=${token}`,
    'HttpOnly',
    'Path=/',
    // Strict, not Lax. The console has no inbound links worth preserving and
    // every one of its endpoints is a state change; Lax would attach the
    // cookie to a top-level GET navigation from any site.
    'SameSite=Strict',
    `Max-Age=${options.maxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
    // Deliberately no Domain attribute. See the note at the top of this file.
  ].join('; ');
}

export function serializeClearedAdminCookie(
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  const secure = nodeEnv === 'production';
  return [
    `${adminCookieName(nodeEnv)}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    'Max-Age=0',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

/**
 * Pulls one cookie value out of a Cookie header.
 *
 * Hand-rolled rather than pulled from a library because the header is the
 * boundary: a value containing '=' must survive, an absent header must not
 * throw, and a name that is a prefix of another name must not match.
 */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    if (trimmed.slice(0, separator) !== name) continue;
    const value = trimmed.slice(separator + 1);
    return value.length > 0 ? value : null;
  }
  return null;
}

/** The admin token from a request's Cookie header, or null. */
export function readAdminToken(
  cookieHeader: string | null | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string | null {
  return readCookie(cookieHeader, adminCookieName(nodeEnv));
}

/**
 * Short-lived proof that the admin's password was accepted.
 *
 * Its own cookie rather than a body-carried token: the exchange only ever
 * happens between two requests from the same browser on the admin host, and
 * keeping it in a host-only HttpOnly cookie means the half-authenticated state
 * is not sitting in a JavaScript variable where a script injection could read
 * it and complete the PIN step from elsewhere.
 */
const CHALLENGE_BASE_NAME = 'aegis_admin_challenge';

export function adminChallengeCookieName(
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  return nodeEnv === 'production' ? `__Host-${CHALLENGE_BASE_NAME}` : CHALLENGE_BASE_NAME;
}

export function serializeChallengeCookie(token: string, options: CookieOptions): string {
  const secure = options.nodeEnv === 'production';
  return [
    `${adminChallengeCookieName(options.nodeEnv)}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${options.maxAgeSeconds}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function serializeClearedChallengeCookie(
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  const secure = nodeEnv === 'production';
  return [
    `${adminChallengeCookieName(nodeEnv)}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    'Max-Age=0',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
