import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The limiter's failure behaviour, which is the part that actually broke.
 *
 * For weeks every call to `consumeAttempt` threw - Mongoose 9 made pipeline
 * updates opt-in and the query was missing `updatePipeline: true` - and the
 * catch logged it and returned `limited: false`. Admin login, trader sign-in,
 * deposit claims and the portfolio builder were all unthrottled, and nothing
 * failed: the application behaved exactly as it does when nobody is over the
 * limit. A bug that presents as "everything is fine" needs a test that
 * disagrees, so most of what follows is about the catch rather than the count.
 *
 * The model and the connection are mocked. What is being asserted is the
 * decision the module makes given an outcome, not whether Mongo can run an
 * aggregation pipeline - that is a property of the database and is proven by
 * scripts/verify-admin-console.mjs against a real one.
 */

const findOneAndUpdate = vi.fn();
const findOne = vi.fn();
const deleteOne = vi.fn();
const connectToDatabase = vi.fn();

vi.mock('@/lib/mongo', () => ({
  connectToDatabase: () => connectToDatabase(),
}));

vi.mock('@/lib/models/RateLimitBucket', () => ({
  RateLimitBucketModel: {
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args),
    findOne: (...args: unknown[]) => findOne(...args),
    deleteOne: (...args: unknown[]) => deleteOne(...args),
  },
}));

const { consumeAttempt, checkLimit } = await import('./rate-limit');

/** A resolved query, since the module calls `.lean()` on the result. */
const lean = <T>(value: T) => ({ lean: () => Promise.resolve(value) });
const throwing = (error: unknown) => ({
  lean: () => Promise.reject(error),
});

/** Reproduces the exact failure this module shipped with. */
function mongooseArrayUpdateError(): Error {
  const error = new Error(
    'Cannot pass an array to query updates unless the `updatePipeline` option is set.'
  );
  error.name = 'MongooseError';
  return error;
}

function networkError(name = 'MongoNetworkError'): Error {
  const error = new Error('connection refused');
  error.name = name;
  return error;
}

const WINDOW = 15 * 60 * 1000;

beforeEach(() => {
  connectToDatabase.mockResolvedValue({});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  findOneAndUpdate.mockReset();
  findOne.mockReset();
  deleteOne.mockReset();
  connectToDatabase.mockReset();
});

describe('the query that broke', () => {
  /*
   * The regression guard. If someone drops the option again the module goes
   * back to silently allowing everything, and this is the cheapest place to
   * notice.
   */
  it('passes updatePipeline, without which Mongoose 9 rejects the update', async () => {
    findOneAndUpdate.mockReturnValue(lean({ hits: [new Date()] }));

    await consumeAttempt('k', 5, WINDOW);

    const [, update, options] = findOneAndUpdate.mock.calls[0];
    expect(Array.isArray(update)).toBe(true);
    expect(options).toMatchObject({ updatePipeline: true, upsert: true });
  });

  it('asks for the document after the write, so the count includes this attempt', async () => {
    findOneAndUpdate.mockReturnValue(lean({ hits: [new Date()] }));

    await consumeAttempt('k', 5, WINDOW);

    expect(findOneAndUpdate.mock.calls[0][2]).toMatchObject({ returnDocument: 'after' });
  });
});

describe('a bug in the limiter', () => {
  /*
   * The headline test. Before the fix this returned { limited: false } and the
   * caller carried on as though the limit had been checked.
   */
  it('does not silently allow the request', async () => {
    findOneAndUpdate.mockReturnValue(throwing(mongooseArrayUpdateError()));

    const result = await consumeAttempt('k', 5, WINDOW);

    expect(result.limited).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('is reported as an error rather than an outage', async () => {
    findOneAndUpdate.mockReturnValue(throwing(mongooseArrayUpdateError()));

    expect((await consumeAttempt('k', 5, WINDOW)).degraded).toBe('error');
  });

  it('denies even when the caller asked to fail open', async () => {
    findOneAndUpdate.mockReturnValue(throwing(mongooseArrayUpdateError()));

    const result = await consumeAttempt('k', 5, WINDOW, { whenUnavailable: 'allow' });

    expect(result.limited).toBe(true);
    expect(result.degraded).toBe('error');
  });

  it('says so loudly, because the log line is the only symptom', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    findOneAndUpdate.mockReturnValue(throwing(mongooseArrayUpdateError()));

    await consumeAttempt('admin-login-account:someone', 5, WINDOW);

    expect(String(spy.mock.calls[0][0])).toMatch(/broken/i);
  });

  it('treats an unrecognised failure as a bug, not as an outage', async () => {
    findOneAndUpdate.mockReturnValue(throwing(new TypeError('undefined is not a function')));

    expect((await consumeAttempt('k', 5, WINDOW)).degraded).toBe('error');
  });

  it('applies the same rule to checkLimit', async () => {
    findOne.mockReturnValue(throwing(mongooseArrayUpdateError()));

    const result = await checkLimit('k', 5, WINDOW);

    expect(result.limited).toBe(true);
    expect(result.degraded).toBe('error');
  });
});

describe('a genuine outage', () => {
  it.each([
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoServerSelectionError',
    'MongoTimeoutError',
    'MongoNotConnectedError',
    'PoolClearedError',
  ])('classifies %s as unavailable', async (name) => {
    findOneAndUpdate.mockReturnValue(throwing(networkError(name)));

    expect((await consumeAttempt('k', 5, WINDOW)).degraded).toBe('unavailable');
  });

  it('allows the request by default, which is the documented choice', async () => {
    findOneAndUpdate.mockReturnValue(throwing(networkError()));

    const result = await consumeAttempt('k', 5, WINDOW);

    expect(result.limited).toBe(false);
    expect(result.degraded).toBe('unavailable');
  });

  it('denies when the caller guards credentials', async () => {
    findOneAndUpdate.mockReturnValue(throwing(networkError()));

    const result = await consumeAttempt('k', 5, WINDOW, { whenUnavailable: 'deny' });

    expect(result.limited).toBe(true);
    expect(result.retryAfterMs).toBe(WINDOW);
  });

  it('honours the same choice when there is no connection at all', async () => {
    connectToDatabase.mockResolvedValue(null);

    expect((await consumeAttempt('k', 5, WINDOW)).limited).toBe(false);
    expect((await consumeAttempt('k', 5, WINDOW, { whenUnavailable: 'deny' })).limited).toBe(true);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('counting, when nothing is broken', () => {
  const hitsAgo = (count: number) =>
    Array.from({ length: count }, (_, i) => new Date(Date.now() - (count - i) * 1000));

  it('never reports degraded on a real answer', async () => {
    findOneAndUpdate.mockReturnValue(lean({ hits: hitsAgo(1) }));

    expect((await consumeAttempt('k', 5, WINDOW)).degraded).toBeUndefined();
  });

  it('allows attempts up to the limit', async () => {
    findOneAndUpdate.mockReturnValue(lean({ hits: hitsAgo(5) }));

    const result = await consumeAttempt('k', 5, WINDOW);

    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('limits the attempt past it', async () => {
    findOneAndUpdate.mockReturnValue(lean({ hits: hitsAgo(6) }));

    expect((await consumeAttempt('k', 5, WINDOW)).limited).toBe(true);
  });

  it('reports how long until the oldest hit leaves the window', async () => {
    const oldest = new Date(Date.now() - 60_000);
    findOneAndUpdate.mockReturnValue(lean({ hits: [oldest, ...hitsAgo(5)] }));

    const result = await consumeAttempt('k', 5, WINDOW);

    expect(result.retryAfterMs).toBeGreaterThan(WINDOW - 61_000);
    expect(result.retryAfterMs).toBeLessThanOrEqual(WINDOW - 59_000);
  });

  /*
   * checkLimit does not record, so it has to reach the same verdict one
   * attempt earlier than consumeAttempt does. Getting this boundary wrong
   * would let one extra guess through on every endpoint that pre-checks.
   */
  it('checkLimit blocks at the limit, having recorded nothing', async () => {
    findOne.mockReturnValue(lean({ hits: hitsAgo(5) }));

    const result = await checkLimit('k', 5, WINDOW);

    expect(result.limited).toBe(true);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('checkLimit ignores hits that have aged out of the window', async () => {
    findOne.mockReturnValue(
      lean({ hits: [new Date(Date.now() - WINDOW - 60_000), ...hitsAgo(2)] })
    );

    const result = await checkLimit('k', 5, WINDOW);

    expect(result.limited).toBe(false);
    expect(result.remaining).toBe(3);
  });
});
