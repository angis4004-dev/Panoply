/**
 * In-memory sliding-window rate limiter. Fine for a single server instance;
 * won't survive a restart or work across multiple instances (same caveat as
 * the existing limiter in the portfolio-builder report route) - swap for a
 * shared store (Redis, etc.) if this app is ever deployed multi-instance.
 */
const store = new Map<string, number[]>();

function activeTimestamps(key: string, windowMs: number): number[] {
  const now = Date.now();
  const timestamps = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  store.set(key, timestamps);
  return timestamps;
}

/** Returns true if `key` has already hit `maxAttempts` within `windowMs`. */
export function isRateLimited(key: string, maxAttempts: number, windowMs: number): boolean {
  return activeTimestamps(key, windowMs).length >= maxAttempts;
}

/** Records one attempt against `key`, to be counted within `windowMs`. */
export function recordAttempt(key: string, windowMs: number): void {
  const timestamps = activeTimestamps(key, windowMs);
  timestamps.push(Date.now());
  store.set(key, timestamps);
}

/** Clears all recorded attempts for `key` (e.g. after a successful login). */
export function resetRateLimit(key: string): void {
  store.delete(key);
}

/** Best-effort client IP from proxy headers; 'unknown' if none are present. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}
