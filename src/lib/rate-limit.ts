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
 * Two kinds of failure, treated differently on purpose
 * ----------------------------------------------------
 * An outage and a bug are not the same event, and collapsing them into one
 * `catch` is what let this module sit broken. Every call was throwing
 * `MongooseError: Cannot pass an array to query updates unless the
 * `updatePipeline` option is set` - Mongoose 9 made pipeline updates opt-in -
 * and the catch logged it and returned `limited: false`. Every limit in the
 * application was off, and the only trace was a log line among many.
 *
 *   unavailable  the database is genuinely unreachable. Honours the caller's
 *                `whenUnavailable` choice, defaulting to allowing the request:
 *                a limiter that cannot read its state should not lock everyone
 *                out. Callers guarding credentials pass 'deny' instead - see
 *                below.
 *   error        anything else. A malformed query, a schema mismatch, a bad
 *                option: a bug, not a weather event. Always denies, and logs
 *                loudly. Failing closed on a bug turns a silent, indefinite
 *                loss of a security control into an obvious outage that gets
 *                fixed the same day. That trade is worth making here because
 *                the limiter is the only thing standing between these
 *                endpoints and unthrottled credential stuffing.
 *
 * `degraded` on the result says which happened, so a caller can tell a real
 * verdict from a guess and tests can assert the difference.
 */

/** Why the limiter could not reach a real verdict. */
export type RateLimitFailure = 'unavailable' | 'error';

export interface RateLimitResult {
  limited: boolean;
  /** Attempts left in the current window; 0 when limited. */
  remaining: number;
  /** Milliseconds until the window frees up, 0 when not limited. */
  retryAfterMs: number;
  /**
   * Absent when the limiter actually counted. Present when it could not, and
   * the verdict is a fallback rather than an answer.
   */
  degraded?: RateLimitFailure;
}

export interface RateLimitOptions {
  /**
   * What to answer when the database is unreachable.
   *
   * 'allow' (default) keeps the availability-over-strictness behaviour for
   * ordinary endpoints. 'deny' is for credential endpoints, where the cost of
   * being wrong is asymmetric: an attacker gets unlimited guesses, while a
   * legitimate user is only inconvenienced during an outage in which they
   * could not have signed in anyway - every caller here needs the database on
   * the very next line to verify a hash or write a row.
   */
  whenUnavailable?: 'allow' | 'deny';
}

/**
 * Is this an outage, or is it our fault?
 *
 * Driver-level connectivity faults are named consistently by the MongoDB
 * driver, so the allow-list is short and explicit. Anything unrecognised is
 * treated as a bug, which is the safe direction: a new connectivity error
 * class would at worst make a credential endpoint stricter for the duration of
 * an outage, whereas defaulting the other way would let the next bug of this
 * shape disable the limits again.
 */
function classifyFailure(error: unknown): RateLimitFailure {
  const name = (error as { name?: string } | null)?.name ?? '';
  const availability = new Set([
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoServerSelectionError',
    'MongoTimeoutError',
    'MongoNotConnectedError',
    'PoolClearedError',
    'MongoPoolClearedError',
  ]);
  return availability.has(name) ? 'unavailable' : 'error';
}

/** The verdict when the limiter could not count. */
function degradedResult(
  failure: RateLimitFailure,
  maxAttempts: number,
  windowMs: number,
  options: RateLimitOptions
): RateLimitResult {
  const deny = failure === 'error' || options.whenUnavailable === 'deny';
  return deny
    ? { limited: true, remaining: 0, retryAfterMs: windowMs, degraded: failure }
    : { limited: false, remaining: maxAttempts, retryAfterMs: 0, degraded: failure };
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
  windowMs: number,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const connection = await connectToDatabase();
  if (!connection) {
    return degradedResult('unavailable', maxAttempts, windowMs, options);
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
      // `updatePipeline` is required from Mongoose 9 on: passing an array as
      // the update throws without it. Mongoose strips the flag before handing
      // the command to the driver, so it never reaches the server.
      { upsert: true, returnDocument: 'after', updatePipeline: true }
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
    const failure = classifyFailure(error);
    if (failure === 'error') {
      console.error(
        `Rate limiter is broken for key "${key}" - denying the request. ` +
          'This is a bug in the limiter, not an outage; every caller is being ' +
          'refused until it is fixed.',
        error
      );
    } else {
      console.error('Rate limit check failed, database unreachable:', error);
    }
    return degradedResult(failure, maxAttempts, windowMs, options);
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
  windowMs: number,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const connection = await connectToDatabase();
  if (!connection) {
    return degradedResult('unavailable', maxAttempts, windowMs, options);
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
    const failure = classifyFailure(error);
    if (failure === 'error') {
      console.error(`Rate limiter read is broken for key "${key}" - denying:`, error);
    } else {
      console.error('Rate limit read failed, database unreachable:', error);
    }
    return degradedResult(failure, maxAttempts, windowMs, options);
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
