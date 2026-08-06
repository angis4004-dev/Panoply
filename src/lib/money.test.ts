import { describe, it, expect } from 'vitest';
import { InvalidAmountError, MAX_AMOUNT_MINOR, toDollars, toMinor, toPositiveMinor } from './money';

describe('toMinor', () => {
  it('converts whole and fractional dollars', () => {
    expect(toMinor(0)).toBe(0);
    expect(toMinor(1)).toBe(100);
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(-5.5)).toBe(-550);
  });

  it('survives the float representations that break naive multiplication', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE-754, and 1.005 * 100 is
    // 100.49999999999999. Truncating either would silently lose a cent on
    // amounts users type every day.
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(1.005)).toBe(101);
    expect(toMinor(0.1 + 0.2)).toBe(30);
  });

  it('rounds to the nearest cent rather than truncating', () => {
    expect(toMinor(1.004)).toBe(100);
    expect(toMinor(1.006)).toBe(101);
    expect(toMinor(-1.006)).toBe(-101);
  });

  it('accepts numeric strings, since request bodies carry them', () => {
    expect(toMinor('42.50')).toBe(4250);
  });

  it('rejects anything that is not a finite number', () => {
    for (const bad of [NaN, Infinity, -Infinity, null, undefined, {}, [], 'abc', true]) {
      expect(() => toMinor(bad)).toThrow(InvalidAmountError);
    }
  });

  it('rejects amounts beyond the representable range', () => {
    expect(() => toMinor(Number.MAX_SAFE_INTEGER)).toThrow(InvalidAmountError);
    expect(() => toMinor(MAX_AMOUNT_MINOR / 100 + 1)).toThrow(InvalidAmountError);
  });

  it('accepts the maximum exactly', () => {
    expect(toMinor(MAX_AMOUNT_MINOR / 100)).toBe(MAX_AMOUNT_MINOR);
  });
});

describe('toPositiveMinor', () => {
  it('rejects zero and negatives', () => {
    expect(() => toPositiveMinor(0)).toThrow(InvalidAmountError);
    expect(() => toPositiveMinor(-1)).toThrow(InvalidAmountError);
    // Rounds to zero, so it must be refused rather than posting a no-op entry.
    expect(() => toPositiveMinor(0.004)).toThrow(InvalidAmountError);
  });

  it('accepts the smallest representable amount', () => {
    expect(toPositiveMinor(0.01)).toBe(1);
  });
});

describe('round trip', () => {
  it('returns the original dollar amount for cent-precise values', () => {
    for (const value of [0, 0.01, 1, 19.99, 1234.56, 999999.99]) {
      expect(toDollars(toMinor(value))).toBe(value);
    }
  });

  it('does not accumulate error across repeated addition', () => {
    // The failure the ledger exists to prevent: adding 0.1 a thousand times in
    // floats drifts, adding 10 minor units a thousand times cannot.
    let minor = 0;
    for (let i = 0; i < 1000; i++) minor += toMinor(0.1);
    expect(minor).toBe(10_000);
    expect(toDollars(minor)).toBe(100);

    let float = 0;
    for (let i = 0; i < 1000; i++) float += 0.1;
    expect(float).not.toBe(100);
  });
});
