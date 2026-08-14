'use client';

// Deliberately not from './dashboard-unlock' - that module reads
// SESSION_SECRET at load and must never enter the client bundle.
import { UNLOCK_HEADER } from './dashboard-unlock-header';

/**
 * Carries the dashboard unlock token from the PIN gate to every request the
 * dashboard makes.
 *
 * A module variable, and nothing else. Not a cookie, not sessionStorage, not
 * localStorage - all three survive a reload, and the gate is specified to ask
 * again on reload. A module variable is discarded when the document is, which
 * is the exact lifetime wanted: it outlives client-side navigation between
 * dashboard pages and dies on refresh, on a new tab, and on close.
 *
 * The interceptor exists because the alternative is threading the token
 * through thirty fetch call sites in the store, the hooks and the pages - and
 * a single missed one is an endpoint that quietly 423s forever. Patching once,
 * for the lifetime of the gate, means every dashboard request carries it
 * including ones written later. It is scoped tightly: same-origin /api/
 * requests only, restored on unmount, and it never touches a request that
 * already sets the header itself.
 */

let unlockToken: string | null = null;
let restoreFetch: (() => void) | null = null;

export function getUnlockToken(): string | null {
  return unlockToken;
}

/** Same-origin API calls only. Nothing is attached to a third-party request. */
function isDashboardApiRequest(url: string): boolean {
  try {
    const resolved = new URL(url, window.location.origin);
    return resolved.origin === window.location.origin && resolved.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

/**
 * Installs the token and starts attaching it. Returns a teardown that removes
 * the patch and forgets the token.
 */
export function installUnlockToken(token: string): () => void {
  unlockToken = token;

  // Guard against a double install - React 18 mounts effects twice in
  // development, and patching a patched fetch would leave the original
  // unreachable once the outer one is restored.
  if (restoreFetch) return teardown;

  const original = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!unlockToken) return original(input, init);

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (!isDashboardApiRequest(url)) return original(input, init);

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    if (!headers.has(UNLOCK_HEADER)) headers.set(UNLOCK_HEADER, unlockToken);

    return original(input, { ...init, headers });
  };

  restoreFetch = () => {
    window.fetch = original;
  };

  return teardown;
}

function teardown() {
  unlockToken = null;
  restoreFetch?.();
  restoreFetch = null;
}

/** Drops the unlock without unmounting - used when the server says 423. */
export function clearUnlockToken(): void {
  teardown();
}
