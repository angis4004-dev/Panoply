import { describe, it, expect } from 'vitest';
import {
  attemptsRemaining,
  formatLockDuration,
  hashPin,
  isValidPinFormat,
  isWeakPin,
  lockRemainingMs,
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
  verifyPin,
} from './pin';

describe('format', () => {
  it('accepts exactly six digits', () => {
    expect(isValidPinFormat('123456')).toBe(true);
    expect(isValidPinFormat('000000')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of [
      '12345',
      '1234567',
      '12345a',
      '12 345',
      '',
      ' 123456',
      '123456 ',
      null,
      123456,
      undefined,
    ]) {
      expect(isValidPinFormat(bad)).toBe(false);
    }
  });

  it('agrees with the declared length', () => {
    expect(isValidPinFormat('9'.repeat(PIN_LENGTH))).toBe(true);
    expect(isValidPinFormat('9'.repeat(PIN_LENGTH + 1))).toBe(false);
  });
});

describe('weak PIN detection', () => {
  it('rejects repeated digits', () => {
    for (const pin of ['000000', '111111', '999999']) {
      expect(isWeakPin(pin)).toBe(true);
    }
  });

  it('rejects runs in both directions, including wraparound', () => {
    for (const pin of ['123456', '654321', '456789', '567890', '098765']) {
      expect(isWeakPin(pin)).toBe(true);
    }
  });

  it('rejects short repeating patterns', () => {
    for (const pin of ['121212', '454545', '123123', '987987']) {
      expect(isWeakPin(pin)).toBe(true);
    }
  });

  it('accepts unremarkable PINs', () => {
    for (const pin of ['498271', '830514', '271828', '604937']) {
      expect(isWeakPin(pin)).toBe(false);
    }
  });
});

describe('hashing', () => {
  it('verifies the correct PIN', () => {
    const hash = hashPin('498271');
    expect(verifyPin('498271', hash)).toBe(true);
  });

  it('rejects an incorrect PIN', () => {
    const hash = hashPin('498271');
    for (const wrong of ['498272', '000000', '49827', '4982710']) {
      expect(verifyPin(wrong, hash)).toBe(false);
    }
  });

  it('never stores the PIN itself', () => {
    const hash = hashPin('498271');
    expect(hash).not.toContain('498271');
  });

  it('salts, so the same PIN hashes differently each time', () => {
    const a = hashPin('498271');
    const b = hashPin('498271');
    expect(a).not.toBe(b);
    expect(verifyPin('498271', a)).toBe(true);
    expect(verifyPin('498271', b)).toBe(true);
  });

  it('uses the salt:key shape the stored value is expected to have', () => {
    expect(hashPin('498271')).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it('returns false rather than throwing on a malformed stored hash', () => {
    // A corrupt row must read as "wrong PIN", not as a 500 that tells an
    // attacker they found something interesting.
    for (const bad of ['', 'nosalt', ':::', 'abc:def']) {
      expect(verifyPin('498271', bad)).toBe(false);
    }
  });
});

describe('lockout state', () => {
  it('reports no lock when none is set', () => {
    expect(lockRemainingMs({})).toBe(0);
    expect(lockRemainingMs({ pinLockedUntil: null })).toBe(0);
  });

  it('reports no lock once it has passed', () => {
    expect(lockRemainingMs({ pinLockedUntil: new Date(Date.now() - 1000) })).toBe(0);
  });

  it('reports time remaining while locked', () => {
    const remaining = lockRemainingMs({ pinLockedUntil: new Date(Date.now() + 60_000) });
    expect(remaining).toBeGreaterThan(59_000);
    expect(remaining).toBeLessThanOrEqual(60_000);
  });

  it('counts attempts down and never below zero', () => {
    expect(attemptsRemaining({})).toBe(MAX_PIN_ATTEMPTS);
    expect(attemptsRemaining({ pinFailedAttempts: 2 })).toBe(MAX_PIN_ATTEMPTS - 2);
    expect(attemptsRemaining({ pinFailedAttempts: 99 })).toBe(0);
  });

  it('rounds durations up, so a message never promises early access', () => {
    expect(formatLockDuration(1000)).toBe('1 minute');
    expect(formatLockDuration(60_000)).toBe('1 minute');
    expect(formatLockDuration(61_000)).toBe('2 minutes');
    expect(formatLockDuration(15 * 60_000)).toBe('15 minutes');
  });
});
