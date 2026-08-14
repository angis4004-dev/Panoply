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
  };
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
  return (
    pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin')
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
