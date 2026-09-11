import { describe, it, expect } from 'vitest';
import {
  activeStepKey,
  deriveJourney,
  EMPTY_DEPOSIT_SUMMARY,
  isJourneyComplete,
  summariseDeposits,
  type JourneyInput,
  type StepKey,
} from '@/lib/onboarding-journey';

const base: JourneyInput = {
  hasPin: true,
  kycStatus: 'verified',
  deposits: EMPTY_DEPOSIT_SUMMARY,
  walletBalance: 0,
  botCount: 0,
};

const stateOf = (input: Partial<JourneyInput>, key: StepKey) =>
  deriveJourney({ ...base, ...input }).find((s) => s.key === key)!;

describe('summariseDeposits', () => {
  it('is empty for no deposits', () => {
    expect(summariseDeposits([])).toEqual(EMPTY_DEPOSIT_SUMMARY);
  });

  it('judges "latest" by createdAt, not by list order', () => {
    const summary = summariseDeposits([
      { status: 'rejected', rejectionReason: 'Old', createdAt: '2026-09-01T00:00:00Z' },
      { status: 'pending', createdAt: '2026-09-05T00:00:00Z' },
    ]);
    expect(summary.latestRejected).toBe(false);
    expect(summary.hasPending).toBe(true);
  });

  it('carries the reason of a rejected latest deposit', () => {
    const summary = summariseDeposits([
      { status: 'pending', createdAt: '2026-09-01T00:00:00Z' },
      { status: 'rejected', rejectionReason: 'Wrong network', createdAt: '2026-09-05T00:00:00Z' },
    ]);
    expect(summary).toMatchObject({ latestRejected: true, rejectionReason: 'Wrong network' });
  });

  it('records any approved deposit', () => {
    expect(
      summariseDeposits([{ status: 'approved', createdAt: '2026-09-01T00:00:00Z' }]).hasApproved
    ).toBe(true);
  });
});

describe('deriveJourney', () => {
  it('always returns the five steps in order', () => {
    expect(deriveJourney(base).map((s) => s.key)).toEqual([
      'account',
      'pin',
      'kyc',
      'deposit',
      'flow',
    ]);
  });

  it('marks the account step done unconditionally', () => {
    expect(stateOf({ hasPin: false, kycStatus: 'unverified' }, 'account').state).toBe('done');
  });

  it('maps the pin step', () => {
    expect(stateOf({ hasPin: false }, 'pin').state).toBe('todo');
    expect(stateOf({ hasPin: true }, 'pin').state).toBe('done');
  });

  it('maps every identity status', () => {
    expect(stateOf({ kycStatus: 'unverified' }, 'kyc').state).toBe('todo');
    expect(stateOf({ kycStatus: 'pending' }, 'kyc')).toMatchObject({ state: 'waiting', cta: null });
    expect(stateOf({ kycStatus: 'rejected' }, 'kyc')).toMatchObject({
      state: 'retry',
      cta: 'Try again',
    });
    expect(stateOf({ kycStatus: 'verified' }, 'kyc').state).toBe('done');
  });

  describe('deposit step', () => {
    it('is locked until identity is verified', () => {
      const step = stateOf({ kycStatus: 'pending' }, 'deposit');
      expect(step).toMatchObject({ state: 'locked', cta: null });
      expect(step.body).toBe('Unlocks once your identity is verified.');
    });

    it('is todo for a verified user with nothing sent', () => {
      expect(stateOf({}, 'deposit')).toMatchObject({ state: 'todo', cta: 'Deposit' });
    });

    it('waits on a pending deposit without promising a time', () => {
      const step = stateOf({ deposits: { ...EMPTY_DEPOSIT_SUMMARY, hasPending: true } }, 'deposit');
      expect(step).toMatchObject({ state: 'waiting', cta: null });
      expect(step.body).not.toMatch(/hour|minute|day|soon/i);
    });

    it('offers a retry with the operator reason when the latest was rejected', () => {
      const step = stateOf(
        {
          deposits: {
            ...EMPTY_DEPOSIT_SUMMARY,
            hasPending: true,
            latestRejected: true,
            rejectionReason: 'Sent on the wrong network',
          },
        },
        'deposit'
      );
      expect(step).toMatchObject({ state: 'retry', cta: 'Try again' });
      expect(step.body).toContain('Sent on the wrong network');
    });

    it('still explains a rejection that came without a reason', () => {
      const step = stateOf(
        { deposits: { ...EMPTY_DEPOSIT_SUMMARY, latestRejected: true, rejectionReason: null } },
        'deposit'
      );
      expect(step.state).toBe('retry');
      expect(step.body.length).toBeGreaterThan(20);
    });

    it('is done once a deposit is approved, even if a later one was rejected', () => {
      expect(
        stateOf(
          { deposits: { ...EMPTY_DEPOSIT_SUMMARY, hasApproved: true, latestRejected: true } },
          'deposit'
        ).state
      ).toBe('done');
    });

    it('is done for a user credited by an operator, with no deposit at all', () => {
      expect(stateOf({ walletBalance: 250 }, 'deposit').state).toBe('done');
      expect(stateOf({ botCount: 1 }, 'deposit').state).toBe('done');
    });
  });

  describe('signal flow step', () => {
    it('is locked until funds are in play', () => {
      const step = stateOf({}, 'flow');
      expect(step).toMatchObject({ state: 'locked', cta: null });
      expect(step.body).toBe('Unlocks once your first deposit is approved.');
    });

    it('is locked while the only deposit is still pending', () => {
      expect(
        stateOf({ deposits: { ...EMPTY_DEPOSIT_SUMMARY, hasPending: true } }, 'flow').state
      ).toBe('locked');
    });

    it('is todo once there is a balance', () => {
      expect(stateOf({ walletBalance: 500 }, 'flow')).toMatchObject({
        state: 'todo',
        cta: 'Create signal flow',
      });
    });

    it('is done once a signal flow exists', () => {
      expect(stateOf({ botCount: 1 }, 'flow').state).toBe('done');
    });
  });
});

describe('activeStepKey', () => {
  it('picks the first todo or retry step', () => {
    expect(activeStepKey(deriveJourney({ ...base, hasPin: false, kycStatus: 'unverified' }))).toBe(
      'pin'
    );
    expect(activeStepKey(deriveJourney(base))).toBe('deposit');
  });

  it('skips steps that are only waiting', () => {
    expect(activeStepKey(deriveJourney({ ...base, kycStatus: 'pending' }))).toBeNull();
  });
});

describe('isJourneyComplete', () => {
  it('is true only when every step is done', () => {
    expect(isJourneyComplete(deriveJourney({ ...base, walletBalance: 10, botCount: 1 }))).toBe(
      true
    );
    expect(isJourneyComplete(deriveJourney({ ...base, walletBalance: 10 }))).toBe(false);
  });
});
