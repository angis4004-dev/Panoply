import { describe, it, expect } from 'vitest';
import {
  DepositTransitionError,
  MAX_CREDIT_MINOR,
  assertDecidable,
  depositIdempotencyKey,
  planApproval,
  planRejection,
} from './deposit-rules';

describe('assertDecidable', () => {
  it('allows a pending deposit through', () => {
    expect(() => assertDecidable('pending')).not.toThrow();
  });

  it('refuses to decide an already-approved deposit', () => {
    expect(() => assertDecidable('approved')).toThrow(DepositTransitionError);
    expect(() => assertDecidable('approved')).toThrow(/already been authorized/i);
  });

  it('refuses to decide an already-rejected deposit', () => {
    expect(() => assertDecidable('rejected')).toThrow(/already been rejected/i);
  });

  it('reports a conflict, not a bad request', () => {
    try {
      assertDecidable('approved');
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as DepositTransitionError).status).toBe(409);
    }
  });
});

describe('planApproval', () => {
  const valid = { creditAmountMinor: 250_00, txReference: '0xabc123def456' };

  it('accepts a well-formed approval', () => {
    expect(planApproval(valid)).toEqual({
      creditAmountMinor: 25000,
      txReference: '0xabc123def456',
      reviewNote: '',
    });
  });

  it('trims the reference and the note', () => {
    const plan = planApproval({ ...valid, txReference: '  0xabc123def456 ', reviewNote: ' ok ' });
    expect(plan.txReference).toBe('0xabc123def456');
    expect(plan.reviewNote).toBe('ok');
  });

  it('requires a credit amount', () => {
    expect(() => planApproval({ ...valid, creditAmountMinor: undefined })).toThrow(
      /credit amount/i
    );
  });

  it('rejects fractional minor units', () => {
    expect(() => planApproval({ ...valid, creditAmountMinor: 100.5 })).toThrow(
      /whole minor units/i
    );
  });

  it('rejects a non-finite amount', () => {
    expect(() => planApproval({ ...valid, creditAmountMinor: Infinity })).toThrow();
    expect(() => planApproval({ ...valid, creditAmountMinor: NaN })).toThrow();
  });

  it('rejects zero and negative credits', () => {
    expect(() => planApproval({ ...valid, creditAmountMinor: 0 })).toThrow(/greater than zero/i);
    expect(() => planApproval({ ...valid, creditAmountMinor: -1 })).toThrow(/greater than zero/i);
  });

  it('rejects an amount past the single-authorization limit', () => {
    expect(() => planApproval({ ...valid, creditAmountMinor: MAX_CREDIT_MINOR + 1 })).toThrow(
      /units/i
    );
  });

  it('will not authorize without a transaction reference', () => {
    expect(() => planApproval({ ...valid, txReference: '' })).toThrow(/transaction reference/i);
    expect(() => planApproval({ ...valid, txReference: '   ' })).toThrow(/transaction reference/i);
    expect(() => planApproval({ ...valid, txReference: '0xab' })).toThrow(/transaction reference/i);
  });

  it('reports validation failures as 400, not 409', () => {
    try {
      planApproval({ ...valid, txReference: '' });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as DepositTransitionError).status).toBe(400);
    }
  });
});

describe('planRejection', () => {
  it('returns the trimmed reason', () => {
    expect(planRejection('  wrong network  ')).toBe('wrong network');
  });

  it('refuses an empty or throwaway reason', () => {
    expect(() => planRejection('')).toThrow(/reason is required/i);
    expect(() => planRejection('  ')).toThrow(/reason is required/i);
    expect(() => planRejection('no')).toThrow(/reason is required/i);
    expect(() => planRejection(undefined)).toThrow(/reason is required/i);
  });
});

describe('depositIdempotencyKey', () => {
  it('derives the key from the deposit id alone, so a retry collides', () => {
    expect(depositIdempotencyKey('653f1a2b3c4d5e6f70819200')).toBe(
      'deposit:653f1a2b3c4d5e6f70819200'
    );
    expect(depositIdempotencyKey('a')).not.toBe(depositIdempotencyKey('b'));
  });
});
