import { describe, it, expect } from 'vitest';
import {
  addLockTerm,
  computeLockStatus,
  computeWithdrawableMinor,
  validateWithdrawalRequest,
  WITHDRAWAL_LOCK_DAYS,
  WITHDRAWAL_LOCK_MS,
  isInvestmentHorizon,
  type LockStatus,
} from './withdrawal-rules';

const d = (iso: string) => new Date(iso);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('the 14-day term', () => {
  it('is fourteen days, held in milliseconds', () => {
    expect(WITHDRAWAL_LOCK_DAYS).toBe(14);
    expect(WITHDRAWAL_LOCK_MS).toBe(14 * DAY);
  });

  /*
   * Millisecond arithmetic, not a date comparison, so a term that starts late
   * in the evening unlocks at that same instant fourteen days on - never at a
   * rounded midnight that would release the money early.
   */
  it('adds exactly fourteen days and keeps the time of day', () => {
    const start = d('2026-01-15T23:40:30.250Z');
    expect(addLockTerm(start).toISOString()).toBe('2026-01-29T23:40:30.250Z');
  });

  it('crosses a month end without shifting', () => {
    expect(addLockTerm(d('2026-01-25T09:00:00Z')).toISOString()).toBe('2026-02-08T09:00:00.000Z');
  });
});

describe('computeLockStatus - the clock needs both conditions', () => {
  it('does not start on a deposit alone', () => {
    const status = computeLockStatus(
      { firstDepositApprovedAt: d('2026-01-01T00:00:00Z'), tradingStartedAt: null },
      d('2027-01-01T00:00:00Z')
    );
    expect(status.reason).toBe('not_started');
    expect(status.withdrawable).toBe(false);
    expect(status.awaiting).toBe('trading');
  });

  it('does not start on trading alone', () => {
    const status = computeLockStatus(
      { firstDepositApprovedAt: null, tradingStartedAt: d('2026-01-01T00:00:00Z') },
      d('2027-01-01T00:00:00Z')
    );
    expect(status.reason).toBe('not_started');
    expect(status.awaiting).toBe('deposit');
  });

  it('reports both when neither has happened', () => {
    const status = computeLockStatus(
      { firstDepositApprovedAt: null, tradingStartedAt: null },
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
      },
      d('2026-03-02T00:00:00Z')
    );
    expect(status.clockStartsAt?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(status.unlocksAt?.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('starts from the later event when trading came second', () => {
    const status = computeLockStatus(
      {
        firstDepositApprovedAt: d('2026-01-01T00:00:00Z'),
        tradingStartedAt: d('2026-02-10T00:00:00Z'),
      },
      d('2026-02-11T00:00:00Z')
    );
    expect(status.clockStartsAt?.toISOString()).toBe('2026-02-10T00:00:00.000Z');
    expect(status.unlocksAt?.toISOString()).toBe('2026-02-24T00:00:00.000Z');
  });
});

describe('computeLockStatus - the 14-day boundary', () => {
  const startMs = d('2026-01-15T12:00:00Z').getTime();
  const started = {
    firstDepositApprovedAt: new Date(startMs),
    tradingStartedAt: new Date(startMs),
  };
  const at = (offsetMs: number) => computeLockStatus(started, new Date(startMs + offsetMs));

  it('is locked at 13 days', () => {
    const status = at(13 * DAY);
    expect(status.reason).toBe('locked');
    expect(status.withdrawable).toBe(false);
  });

  it('is locked at 13 days 23 hours 59 minutes', () => {
    const status = at(13 * DAY + 23 * HOUR + 59 * MINUTE);
    expect(status.reason).toBe('locked');
    expect(status.withdrawable).toBe(false);
  });

  it('is locked one millisecond before 14 days', () => {
    expect(at(14 * DAY - 1).withdrawable).toBe(false);
  });

  /*
   * Inclusive on purpose. Someone told "unlocks 29 January, 12:00" and
   * refused at 12:00 has been misled, and will say so.
   */
  it('is unlocked at exactly 14 days', () => {
    const status = at(14 * DAY);
    expect(status.reason).toBe('unlocked');
    expect(status.withdrawable).toBe(true);
    expect(status.unlocksAt?.toISOString()).toBe('2026-01-29T12:00:00.000Z');
  });

  it('is unlocked at 15 days', () => {
    const status = at(15 * DAY);
    expect(status.reason).toBe('unlocked');
    expect(status.withdrawable).toBe(true);
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
    expect(validateWithdrawalRequest({ ...ok, lock: locked })).toMatch(/14 days/i);
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
