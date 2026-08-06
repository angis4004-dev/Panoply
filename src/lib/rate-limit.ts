import { connectToDatabase } from '@/lib/mongo';
import { RateLimitBucketModel } from '@/lib/models/RateLimitBucket';

/**
 * Sliding-window rate limiting backed by the shared database.
 *
 * The previous implementation was a module-level Map. It reset on every deploy
 * and cold start, and on serverless each concurrent invocation could hold its
 * own copy - so "five attempts per fifteen minutes" was really five per
 * instance per lifetime. Against the six-digit PIN and password endpoints that
 * is the difference between a limit and the appearance of one.
 *
 * Fails OPEN when the database is unreachable: a limiter that cannot read its
 * state should not lock every user out of signing in. That is a deliberate
 * availability-over-strictness choice, and it is safe here only because the
 * endpoints this guards have their own second control - the PIN has a
 * persistent per-account lockout, and password login has one too.
 */

export interface RateLimitResult {
  limited: boolean;
  /** Attempts left in the current window; 0 when limited. */
  remaining: number;
  /** Milliseconds until the window frees up, 0 when not limited. */
  retryAfterMs: number;
}

/**
 * Records one attempt and reports whether the caller is now over the limit.
 *
 * Single atomic operation: an aggregation-pipeline update drops timestamps
 * outside the window and appends the current one in the same write, so
 * concurrent requests cannot interleave a read and a write and each conclude
 * they were under the limit.
 */
export async function consumeAttempt(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<RateLimitResult> {
  const connection = await connectToDatabase();
  if (!connection) {
    return { limited: false, remaining: maxAttempts, retryAfterMs: 0 };
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);

  try {
    const bucket = await RateLimitBucketModel.findOneAndUpdate(
      { key },
      [
        {
          $set: {
            hits: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ['$hits', []] },
                    cond: { $gte: ['$$this', cutoff] },
                  },
                },
                [now],
              ],
            },
            expiresAt: new Date(now.getTime() + windowMs),
          },
        },
      ],
      { upsert: true, returnDocument: 'after' }
    ).lean();

    const hits = bucket?.hits ?? [];
    const limited = hits.length > maxAttempts;
    const oldest = hits[0];

    return {
      limited,
      remaining: Math.max(0, maxAttempts - hits.length),
      retryAfterMs:
        limited && oldest ? Math.max(0, new Date(oldest).getTime() + windowMs - now.getTime()) : 0,
    };
  } catch (error) {
    console.error('Rate limit check failed, allowing request:', error);
    return { limited: false, remaining: maxAttempts, retryAfterMs: 0 };
  }
}

/**
 * Reports the current state without recording an attempt.
 *
 * Used to reject an already-limited caller before doing any expensive work -
 * notably before verifying a password, which is a deliberately slow operation.
 */
export async function checkLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<RateLimitResult> {
  const connection = await connectToDatabase();
  if (!connection) {
    return { limited: false, remaining: maxAttempts, retryAfterMs: 0 };
  }

  try {
    const now = Date.now();
    const cutoff = now - windowMs;
    const bucket = await RateLimitBucketModel.findOne({ key }).lean();

    const hits = (bucket?.hits ?? []).filter((h) => new Date(h).getTime() >= cutoff);
    const limited = hits.length >= maxAttempts;

    return {
      limited,
      remaining: Math.max(0, maxAttempts - hits.length),
      retryAfterMs:
        limited && hits[0] ? Math.max(0, new Date(hits[0]).getTime() + windowMs - now) : 0,
    };
  } catch (error) {
    console.error('Rate limit read failed, allowing request:', error);
    return { limited: false, remaining: maxAttempts, retryAfterMs: 0 };
  }
}

/** Clears a key, e.g. after a successful sign-in. */
export async function resetRateLimit(key: string): Promise<void> {
  const connection = await connectToDatabase();
  if (!connection) return;
  try {
    await RateLimitBucketModel.deleteOne({ key });
  } catch (error) {
    console.error('Rate limit reset failed:', error);
  }
}

/**
 * Best-effort client IP from proxy headers.
 *
 * x-forwarded-for is client-controlled unless a trusted proxy overwrites it,
 * so an attacker can rotate it freely. That is why IP is only ever half of a
 * limit key here and the per-account lockout does the real work.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/** Human-readable retry hint for an error message. */
export function formatRetryAfter(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return 'a minute';
  return `${minutes} minutes`;
}
