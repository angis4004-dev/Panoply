import { describe, it, expect } from 'vitest';
import {
  addMonths,
  computeLockStatus,
  computeWithdrawableMinor,
  validateWithdrawalRequest,
  HORIZON_MONTHS,
  isInvestmentHorizon,
  type LockStatus,
} from './withdrawal-rules';

const d = (iso: string) => new Date(iso);

describe('addMonths', () => {
  it('adds whole months', () => {
    expect(addMonths(d('2026-01-15T10:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-04-15');
    expect(addMonths(d('2026-01-15T10:00:00Z'), 12).toISOString().slice(0, 10)).toBe('2027-01-15');
  });

  /*
   * The reason this function exists instead of setMonth. Date rolls 31 Jan +
   * 1 month into 3 March, which on a capital lock would hand someone two
   * extra days of waiting they were never told about.
   */
  it('clamps to the end of a shorter month instead of rolling over', () => {
    expect(addMonths(d('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(d('2026-03-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-04-30');
  });

  it('handles a leap February', () => {
    expect(addMonths(d('2028-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2028-02-29');
  });

  it('preserves the time of day, so unlock is not silently moved', () => {
    const start = d('2026-01-15T13:45:30Z');
    expect(addMonths(start, 3).toISOString().slice(11)).toBe(start.toISOString().slice(11));
  });
});

describe('computeLockStatus - the clock needs both conditions', () => {
  const horizon = 'short' as const;

  it('does not start on a deposit alone', () => {
    const status = computeLockStatus(
      { firstDepositApprovedAt: d('2026-01-01T00:00:00Z'), tradingStartedAt: null, horizon },
      d('2027-01-01T00:00:00Z')
    );
    expect(status.reason).toBe('not_started');
    expect(status.withdrawable).toBe(false);
    expect(status.awaiting).toBe('trading');
  });

  it('does not start on trading alone', () => {
    const status = computeLockStatus(
      { firstDepositApprovedAt: null, tradingStartedAt: d('2026-01-01T00:00:00Z'), horizon },
      d('2027-01-01T00:00:00Z')
    );
    expect(status.reason).toBe('not_started');
    expect(status.awaiting).toBe('deposit');
  });

  it('reports both when neither has happened', () => {
    const status = computeLockStatus(
      { firstDepositApprovedAt: null, tradingStartedAt: null, horizon },
      d('2026-01-01T00:00:00Z')
    );
    expect(status.awaiting).toBe('both');
  });

  /*
   * The rule that stops the two obvious ways round the lock: depositing and
   * never trading, or starting a flow on an empty wallet and depositing at
   * the end of the term.
   */
  it('starts from the later event when the deposit came second', () => {
    const status = computeLockStatus(
      {
        tradingStartedAt: d('2026-01-01T00:00:00Z'),
        firstDepositApprovedAt: d('2026-03-01T00:00:00Z'),
        horizon,
      },
      d('2026-03-02T00:00:00Z')
    );
    expect(status.clockStartsAt?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(status.unlocksAt?.toISOString().slice(0, 10)).toBe('2026-06-01');
  });

  it('starts from the later event when trading came second', () => {
    const status = computeLockStatus(
      {
        firstDepositApprovedAt: d('2026-01-01T00:00:00Z'),
        tradingStartedAt: d('2026-02-10T00:00:00Z'),
        horizon,
      },
      d('2026-02-11T00:00:00Z')
    );
    expect(status.clockStartsAt?.toISOString()).toBe('2026-02-10T00:00:00.000Z');
    expect(status.unlocksAt?.toISOString().slice(0, 10)).toBe('2026-05-10');
  });
});

describe('computeLockStatus - terms and boundaries', () => {
  const started = {
    firstDepositApprovedAt: d('2026-01-15T12:00:00Z'),
    tradingStartedAt: d('2026-01-15T12:00:00Z'),
  };

  it('short is three months, long is twelve', () => {
    expect(HORIZON_MONTHS.short).toBe(3);
    expect(HORIZON_MONTHS.long).toBe(12);

    expect(
      computeLockStatus({ ...started, horizon: 'short' }, d('2026-01-16T00:00:00Z'))
        .unlocksAt?.toISOString()
        .slice(0, 10)
    ).toBe('2026-04-15');

    expect(
      computeLockStatus({ ...started, horizon: 'long' }, d('2026-01-16T00:00:00Z'))
        .unlocksAt?.toISOString()
        .slice(0, 10)
    ).toBe('2027-01-15');
  });

  it('is locked one millisecond before the term ends', () => {
    const status = computeLockStatus(
      { ...started, horizon: 'short' },
      d('2026-04-15T11:59:59.999Z')
    );
    expect(status.reason).toBe('locked');
    expect(status.withdrawable).toBe(false);
  });

  /*
   * Inclusive on purpose. Someone told "unlocks 15 April" and refused on
   * 15 April has been misled, and will say so.
   */
  it('is unlocked exactly on the unlock instant', () => {
    const status = computeLockStatus({ ...started, horizon: 'short' }, d('2026-04-15T12:00:00Z'));
    expect(status.reason).toBe('unlocked');
    expect(status.withdrawable).toBe(true);
  });

  it('a long horizon is still locked after the short term would have passed', () => {
    const status = computeLockStatus({ ...started, horizon: 'long' }, d('2026-06-15T12:00:00Z'));
    expect(status.reason).toBe('locked');
  });
});

describe('computeWithdrawableMinor', () => {
  const unlocked: LockStatus = {
    reason: 'unlocked',
    clockStartsAt: d('2026-01-01T00:00:00Z'),
    unlocksAt: d('2026-04-01T00:00:00Z'),
    withdrawable: true,
    awaiting: null,
  };
  const locked: LockStatus = { ...unlocked, reason: 'locked', withdrawable: false };

  it('is zero while locked, whatever the balance', () => {
    expect(computeWithdrawableMinor({ balanceMinor: 500_00, pendingMinor: 0, lock: locked })).toBe(
      0
    );
  });

  it('is the ledger balance once unlocked', () => {
    expect(
      computeWithdrawableMinor({ balanceMinor: 500_00, pendingMinor: 0, lock: unlocked })
    ).toBe(500_00);
  });

  /*
   * A pending request is an unbanked claim on the same funds. Without this,
   * a trader holding 100 could file two requests for 100 each and overdraw
   * the ledger if both were approved.
   */
  it('subtracts amounts already awaiting review', () => {
    expect(
      computeWithdrawableMinor({ balanceMinor: 500_00, pendingMinor: 200_00, lock: unlocked })
    ).toBe(300_00);
  });

  it('never goes negative when pending exceeds the balance', () => {
    expect(
      computeWithdrawableMinor({ balanceMinor: 100_00, pendingMinor: 400_00, lock: unlocked })
    ).toBe(0);
  });
});

describe('validateWithdrawalRequest', () => {
  const unlocked: LockStatus = {
    reason: 'unlocked',
    clockStartsAt: d('2026-01-01T00:00:00Z'),
    unlocksAt: d('2026-04-01T00:00:00Z'),
    withdrawable: true,
    awaiting: null,
  };
  const ok = {
    amountMinor: 100_00,
    withdrawableMinor: 500_00,
    kycStatus: 'verified',
    addressConfirmed: true,
    hasPendingRequest: false,
    lock: unlocked,
  };

  it('accepts a valid request', () => {
    expect(validateWithdrawalRequest(ok)).toBeNull();
  });

  it('requires verified identity', () => {
    expect(validateWithdrawalRequest({ ...ok, kycStatus: 'pending' })).toMatch(/identity/i);
  });

  it('requires a confirmed payout wallet', () => {
    expect(validateWithdrawalRequest({ ...ok, addressConfirmed: false })).toMatch(/wallet/i);
  });

  it('refuses a second concurrent request', () => {
    expect(validateWithdrawalRequest({ ...ok, hasPendingRequest: true })).toMatch(/awaiting/i);
  });

  it('refuses while the term is running', () => {
    const locked: LockStatus = { ...unlocked, reason: 'locked', withdrawable: false };
    expect(validateWithdrawalRequest({ ...ok, lock: locked })).toMatch(/term/i);
  });

  it('explains which condition is outstanding', () => {
    const notStarted: LockStatus = {
      reason: 'not_started',
      clockStartsAt: null,
      unlocksAt: null,
      withdrawable: false,
      awaiting: 'trading',
    };
    expect(validateWithdrawalRequest({ ...ok, lock: notStarted })).toMatch(/signal flow/i);
  });

  it('refuses more than the withdrawable balance', () => {
    expect(validateWithdrawalRequest({ ...ok, amountMinor: 600_00 })).toMatch(/exceeds/i);
  });

  it('refuses zero, negative and non-integer amounts', () => {
    expect(validateWithdrawalRequest({ ...ok, amountMinor: 0 })).toMatch(/valid amount/i);
    expect(validateWithdrawalRequest({ ...ok, amountMinor: -100 })).toMatch(/valid amount/i);
    expect(validateWithdrawalRequest({ ...ok, amountMinor: 10.5 })).toMatch(/valid amount/i);
  });

  describe('the per-network minimum', () => {
    it('refuses an amount below the chain floor, naming the chain', () => {
      const complaint = validateWithdrawalRequest({
        ...ok,
        amountMinor: 10_00,
        networkMinimumMinor: 25_00,
        networkName: 'Ethereum (ERC-20)',
      });
      expect(complaint).toMatch(/minimum withdrawal on Ethereum \(ERC-20\) is \$25\.00/);
    });

    it('accepts an amount exactly on the floor', () => {
      expect(
        validateWithdrawalRequest({ ...ok, amountMinor: 25_00, networkMinimumMinor: 25_00 })
      ).toBeNull();
    });

    it('applies no floor when the network sets none', () => {
      expect(
        validateWithdrawalRequest({ ...ok, amountMinor: 1, networkMinimumMinor: null })
      ).toBeNull();
    });

    /*
     * The two failures are easy to hit together, because the amounts that fall
     * under a chain floor are small ones. "You cannot afford it" would be the
     * wrong thing to say to someone asking for less than the chain permits.
     */
    it('reports the floor rather than the balance when both would fail', () => {
      expect(
        validateWithdrawalRequest({
          ...ok,
          amountMinor: 10_00,
          withdrawableMinor: 5_00,
          networkMinimumMinor: 25_00,
        })
      ).toMatch(/minimum withdrawal/i);
    });
  });
});

describe('isInvestmentHorizon', () => {
  it('accepts only the two known horizons', () => {
    expect(isInvestmentHorizon('short')).toBe(true);
    expect(isInvestmentHorizon('long')).toBe(true);
    expect(isInvestmentHorizon('medium')).toBe(false);
    expect(isInvestmentHorizon(undefined)).toBe(false);
  });
});
