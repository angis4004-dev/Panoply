import { describe, it, expect } from 'vitest';
import {
  RECOVERY_REDEEM_MAX_PER_IP,
  RECOVERY_REDEEM_WINDOW_MS,
  RECOVERY_REQUEST_MAX_PER_IP,
  RECOVERY_REQUEST_MAX_PER_RECIPIENT,
  RECOVERY_REQUEST_WINDOW_MS,
  rateLimitKeys,
  tooManyRequests,
} from '@/lib/auth-rate-limits';

/**
 * The policy, not the counting. `rate-limit.test.ts` covers whether the
 * limiter counts correctly; what is asserted here is the part a route depends
 * on being stable - that two callers never land in the same bucket by
 * accident, and that the 429 says how long without saying how many.
 *
 * Key collisions are the failure worth a test. They are silent: nothing
 * errors, the limits simply apply to the wrong population, and the symptom is
 * a user occasionally locked out of a flow they never touched.
 */

describe('recovery rate limit keys', () => {
  it('keeps every endpoint in its own bucket', () => {
    const keys = [
      rateLimitKeys.forgotPasswordRecipient('a@example.com'),
      rateLimitKeys.forgotPasswordIp('198.51.100.7'),
      rateLimitKeys.pinForgotUser('user-1'),
      rateLimitKeys.resetPasswordIp('198.51.100.7'),
      rateLimitKeys.pinResetIp('198.51.100.7'),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not let an IP collide with an address or a user id', () => {
    // The same string in two roles has to produce two keys, or a caller whose
    // proxy reports something address-shaped could spend an account's budget.
    expect(rateLimitKeys.forgotPasswordIp('a@example.com')).not.toBe(
      rateLimitKeys.forgotPasswordRecipient('a@example.com')
    );
    expect(rateLimitKeys.pinForgotUser('198.51.100.7')).not.toBe(
      rateLimitKeys.pinResetIp('198.51.100.7')
    );
  });

  it('treats one address as one recipient however it is typed', () => {
    // The schema lower-cases and trims already. This is the second lock on the
    // same door: an address that slipped through in another case would get a
    // fresh budget, which is the one bypass that matters for mail-bombing.
    const expected = rateLimitKeys.forgotPasswordRecipient('person@example.com');
    expect(rateLimitKeys.forgotPasswordRecipient('Person@Example.com')).toBe(expected);
    expect(rateLimitKeys.forgotPasswordRecipient('  person@example.com  ')).toBe(expected);
  });
});

describe('recovery rate limit budgets', () => {
  it('lets a recipient be mailed less often than an IP may ask', () => {
    // If this inverted, the recipient limit would be unreachable and the
    // mail-bomb defence would be the IP key alone - which rotates freely.
    expect(RECOVERY_REQUEST_MAX_PER_RECIPIENT).toBeLessThan(RECOVERY_REQUEST_MAX_PER_IP);
  });

  it('holds a request window long enough to outlast the link it sends', () => {
    // Reset links live an hour. A window shorter than that would let someone
    // top up a fresh link before the previous one expired, which is the loop
    // the recipient limit exists to close.
    expect(RECOVERY_REQUEST_WINDOW_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  it('keeps redemption attempts few and the lockout short', () => {
    expect(RECOVERY_REDEEM_MAX_PER_IP).toBeLessThanOrEqual(10);
    expect(RECOVERY_REDEEM_WINDOW_MS).toBeLessThanOrEqual(RECOVERY_REQUEST_WINDOW_MS);
  });
});

describe('tooManyRequests', () => {
  it('answers 429 with a Retry-After a client can act on', async () => {
    const response = tooManyRequests('Too many attempts.', 5 * 60 * 1000);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('300');
    await expect(response.json()).resolves.toEqual({
      error: 'Too many attempts. Try again in 5 minutes.',
    });
  });

  it('never reports a Retry-After of zero', () => {
    // A degraded verdict can arrive with no measured wait. `Retry-After: 0`
    // reads as "retry now" and turns a well-behaved client into a hot loop.
    expect(tooManyRequests('Too many attempts.', 0).headers.get('Retry-After')).toBe('1');
  });

  it('does not tell the caller how many attempts are left', () => {
    // A countdown tells an attacker exactly how hard they may push.
    const body = tooManyRequests('Too many failed reset attempts.', 60_000);
    expect(body.status).toBe(429);
    return expect(body.json()).resolves.toEqual({
      error: 'Too many failed reset attempts. Try again in a minute.',
    });
  });
});
