/**
 * Which of the two applications a request is addressed to.
 *
 * One deployment serves both surfaces, so the Host header is what separates
 * them. Everything downstream - which routes exist, which cookie is read,
 * which headers are set - follows from this single decision, and it is pure so
 * that it can be tested exhaustively rather than by curling a running server
 * with a forged Host.
 *
 * A word on trusting Host at all: it is client-supplied. Behind a reverse
 * proxy it is only meaningful if the proxy is configured to pass the real
 * value and to reject requests for hostnames it does not serve, which is the
 * standard configuration and is also what TLS certificate matching already
 * forces in practice. It is not the only control either - the admin session
 * cookie is host-scoped by the browser, so a request that reaches the admin
 * surface with a spoofed Host still arrives with no admin cookie attached and
 * is rejected as unauthenticated.
 */

export type Surface = 'admin' | 'app';

export interface HostConfig {
  /** Canonical admin hostname, e.g. admin.example.com. */
  adminHost?: string;
  /** Canonical trader hostname, e.g. app.example.com. */
  appHost?: string;
  /**
   * Serve the console at /admin on the ordinary application host instead of
   * on a subdomain.
   *
   * Off by default, and it should stay off wherever a subdomain is possible -
   * the subdomain split is what makes /api/admin unreachable from the trader
   * origin, and turning this on gives that up.
   *
   * It exists because some deployments cannot have the subdomain at all. A
   * Vercel project on its default *.vercel.app URL is the case that forced it:
   * arbitrary subdomains of vercel.app cannot be registered, so
   * admin.myproject.vercel.app will never resolve no matter what ADMIN_HOST
   * says. Without this flag such a deployment has no reachable console.
   *
   * Optional, and absent means off. A config assembled by hand - in a test, or
   * anywhere that only cares about hostnames - must not switch this on by
   * omission.
   */
  pathRouting?: boolean;
}

/** Strips the port and lowercases. Returns '' for anything unusable. */
export function normalizeHostname(host: string | null | undefined): string {
  if (typeof host !== 'string') return '';
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return '';
  // IPv6 literals arrive bracketed: [::1]:4028
  if (trimmed.startsWith('[')) {
    const close = trimmed.indexOf(']');
    return close === -1 ? trimmed : trimmed.slice(0, close + 1);
  }
  return trimmed.split(':')[0];
}

/**
 * Reads the configured hostnames out of the environment.
 *
 * Accepts either a bare hostname or a full origin, because the same value is
 * useful as a URL elsewhere and requiring two spellings of it invites them to
 * drift apart.
 */
export function hostConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HostConfig {
  return {
    adminHost: normalizeHostname(stripScheme(env.ADMIN_HOST || env.ADMIN_APP_URL)),
    appHost: normalizeHostname(stripScheme(env.APP_HOST || env.NEXT_PUBLIC_APP_URL)),
    pathRouting: isTruthy(env.ADMIN_PATH_ROUTING),
  };
}

/**
 * Only an explicit affirmative enables a flag.
 *
 * Anything else - including the string "false", which is what an environment
 * variable set to false actually contains and which is truthy in JavaScript -
 * leaves it off. For a flag that removes an isolation boundary, the failure
 * mode has to be "stayed off" rather than "turned on because the value was a
 * non-empty string".
 */
function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function stripScheme(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/\/.*$/, '');
}

/**
 * Decides which surface a hostname belongs to.
 *
 * When ADMIN_HOST is configured the match is exact, and nothing else is the
 * admin surface - that is the production posture, and it means a wildcard DNS
 * entry or a preview URL cannot accidentally serve the console.
 *
 * With no configuration - local development - an `admin.` prefix is treated as
 * the admin surface, so `admin.localhost:4028` works out of the box. This
 * fallback is why isAdminHostConfigured exists: the guard refuses to run in
 * production without explicit configuration rather than relying on a
 * convention.
 */
export function classifyHost(host: string | null | undefined, config: HostConfig): Surface {
  const hostname = normalizeHostname(host);
  if (!hostname) return 'app';

  if (config.adminHost) {
    return hostname === config.adminHost ? 'admin' : 'app';
  }

  return hostname === 'admin.localhost' || hostname.startsWith('admin.') ? 'admin' : 'app';
}

export function isAdminSurface(request: { headers: Headers }, config?: HostConfig): boolean {
  return classifyHost(request.headers.get('host'), config ?? hostConfigFromEnv()) === 'admin';
}

/** True when the deployment has told us what the admin hostname actually is. */
export function isAdminHostConfigured(config: HostConfig = hostConfigFromEnv()): boolean {
  return Boolean(config.adminHost);
}

/**
 * Paths belonging to the admin application.
 *
 * Used in both directions: these must 404 on the trader host, and everything
 * that is *not* one of these (plus framework and asset paths) must 404 on the
 * admin host. Keeping one list means the two rules cannot fall out of step.
 */
export function isAdminPath(pathname: string): boolean {
  /*
   * Each prefix needs its trailing slash, and its exact form spelled out
   * separately. `startsWith('/api/admin')` without the slash also matches
   * /api/administrators - a trader route that would then 404 on the trader
   * host and be served on the admin one. No such route exists today, which is
   * the only reason the bug was invisible; adding one would have made a
   * trader endpoint reachable only by an operator.
   */
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/api/admin' ||
    pathname.startsWith('/api/admin/')
  );
}

/**
 * Paths the admin host serves that are not themselves admin paths: framework
 * assets, the favicon, and the health of the Next runtime.
 */
export function isInfrastructurePath(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/__nextjs') ||
    pathname === '/favicon.ico' ||
    pathname === '/apple-icon.png' ||
    pathname === '/robots.txt'
  );
}

/**
 * Which surface a request belongs to, given both the host and the path.
 *
 * The host alone is not enough once path routing is available: under that mode
 * one hostname serves both applications and only the path separates them.
 * classifyHost is left as it was - it answers a narrower question and is used
 * where only the host is known - so this is the function to reach for when the
 * path is in hand, which is everywhere that matters.
 */
export function resolveSurface(
  host: string | null | undefined,
  pathname: string,
  config: HostConfig = hostConfigFromEnv()
): Surface {
  if (config.pathRouting) {
    return isAdminPath(pathname) ? 'admin' : 'app';
  }
  return classifyHost(host, config);
}

/**
 * Why this request must not be served the console, or null if it may be.
 *
 * The whole host rule in one place. It previously existed as the same six
 * lines copied into the proxy, the API guard and both page guards, which is
 * three opportunities for the four of them to disagree - and disagreement here
 * means either a console nobody can reach or one anybody can.
 *
 * Returns a reason string rather than a boolean so the caller can log
 * something an operator can act on. A console that 404s silently is the
 * failure this function was written after: the deployment was correct in every
 * respect except one unset variable, and nothing anywhere said so.
 */
export function adminSurfaceDenial(
  host: string | null | undefined,
  pathname: string,
  config: HostConfig = hostConfigFromEnv(),
  isProduction: boolean = process.env.NODE_ENV === 'production'
): string | null {
  if (resolveSurface(host, pathname, config) !== 'admin') {
    return 'This request is not addressed to the admin surface.';
  }

  /*
   * Fail closed, but only when nothing has been configured. Path routing is
   * itself an explicit statement of where the console lives, so it satisfies
   * this requirement in the same way ADMIN_HOST does. Without that exemption
   * the flag would be inert in production, which is the only place it is for.
   */
  if (isProduction && !isAdminHostConfigured(config) && !config.pathRouting) {
    return (
      'ADMIN_HOST is not configured. Refusing to serve the admin console rather than ' +
      'falling back to matching any hostname beginning with "admin.". Set ADMIN_HOST to ' +
      'the console hostname, or set ADMIN_PATH_ROUTING=true to serve it at /admin on the ' +
      'main host.'
    );
  }

  return null;
}
