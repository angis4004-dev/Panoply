import { describe, expect, it } from 'vitest';
import { StaleBalanceError, targetBalanceDelta } from './admin-balance';

describe('targetBalanceDelta', () => {
  it('returns the delta from the balance the admin reviewed', () => {
    expect(
      targetBalanceDelta({ expectedMinor: 10_000, currentMinor: 10_000, targetMinor: 20_000 })
    ).toBe(10_000);
  });

  it('rejects an adjustment when another action changed the balance first', () => {
    expect(() =>
      targetBalanceDelta({ expectedMinor: 10_000, currentMinor: 20_000, targetMinor: 20_000 })
    ).toThrow(StaleBalanceError);
  });
});
