/**
 * The path a new trader takes from sign-up to their first signal flow.
 *
 * A pure function of facts the dashboard already holds, so the checklist and
 * the Overview's button styling read one answer rather than each deciding for
 * themselves what "ready to deposit" means. See
 * docs/superpowers/specs/2026-09-11-first-deposit-journey-design.md.
 *
 * The journey has two waits built into it - identity review and deposit
 * approval - that can each run for days. Every state here is written to be
 * true while the user is away, because that is when most of them are read.
 */

export type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type StepKey = 'account' | 'pin' | 'kyc' | 'deposit' | 'flow';
export type StepState = 'done' | 'todo' | 'retry' | 'waiting' | 'locked';

export interface JourneyStep {
  key: StepKey;
  state: StepState;
  title: string;
  body: string;
  /** Button label, or null when there is nothing for the user to do. */
  cta: string | null;
}

/** The fields of a deposit this module reads. /api/deposits returns more. */
export interface DepositLike {
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  createdAt: string | Date;
}

export interface DepositSummary {
  hasApproved: boolean;
  hasPending: boolean;
  /** The most recent deposit, by createdAt, was rejected. */
  latestRejected: boolean;
  /** The operator's reason for that rejection, when they gave one. */
  rejectionReason: string | null;
}

export const EMPTY_DEPOSIT_SUMMARY: DepositSummary = {
  hasApproved: false,
  hasPending: false,
  latestRejected: false,
  rejectionReason: null,
};

/**
 * Sorted here rather than trusting the API's order. The route happens to sort
 * newest first today; "the latest was rejected" should not silently change
 * meaning if that ever stops being true.
 */
export function summariseDeposits(deposits: DepositLike[]): DepositSummary {
  if (deposits.length === 0) return EMPTY_DEPOSIT_SUMMARY;
  const latest = [...deposits].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  const latestRejected = latest.status === 'rejected';
  return {
    hasApproved: deposits.some((d) => d.status === 'approved'),
    hasPending: deposits.some((d) => d.status === 'pending'),
    latestRejected,
    rejectionReason: latestRejected ? latest.rejectionReason?.trim() || null : null,
  };
}

export interface JourneyInput {
  hasPin: boolean;
  kycStatus: KycStatus;
  deposits: DepositSummary;
  walletBalance: number;
  botCount: number;
}

/**
 * Money the user can already put to work.
 *
 * Not just "a deposit was approved": operators can credit a balance directly
 * (src/lib/admin-balance.ts). A user funded that way has never deposited, and
 * a rule keyed on deposits alone would ask them to forever and never let the
 * checklist close.
 */
function hasFundsInPlay({ deposits, walletBalance, botCount }: JourneyInput): boolean {
  return deposits.hasApproved || walletBalance > 0 || botCount > 0;
}

function kycStep(status: KycStatus): JourneyStep {
  const title = 'Verify your identity';
  switch (status) {
    case 'verified':
      return { key: 'kyc', state: 'done', title, body: 'Done.', cta: null };
    case 'pending':
      return {
        key: 'kyc',
        state: 'waiting',
        title,
        body: 'Submitted. We are reviewing your documents and will update you here.',
        cta: null,
      };
    case 'rejected':
      return {
        key: 'kyc',
        state: 'retry',
        title,
        body: 'Your last submission could not be verified. Check the details and try again.',
        cta: 'Try again',
      };
    default:
      return {
        key: 'kyc',
        state: 'todo',
        title,
        body: 'Required before you can deposit funds or allocate capital to a signal flow.',
        cta: 'Verify identity',
      };
  }
}

function depositStep(input: JourneyInput): JourneyStep {
  const title = 'Make your first deposit';
  const { deposits } = input;

  if (hasFundsInPlay(input)) {
    return { key: 'deposit', state: 'done', title, body: 'Your account is funded.', cta: null };
  }
  if (input.kycStatus !== 'verified') {
    return {
      key: 'deposit',
      state: 'locked',
      title,
      body: 'Unlocks once your identity is verified.',
      cta: null,
    };
  }
  if (deposits.latestRejected) {
    return {
      key: 'deposit',
      state: 'retry',
      title,
      body: deposits.rejectionReason
        ? `Your last deposit could not be matched: ${deposits.rejectionReason}`
        : 'Your last deposit could not be matched. Check the network and the transaction reference, then try again.',
      cta: 'Try again',
    };
  }
  if (deposits.hasPending) {
    return {
      key: 'deposit',
      state: 'waiting',
      title,
      body: 'Sent. We match it on-chain, and your balance updates once it is approved.',
      cta: null,
    };
  }
  return {
    key: 'deposit',
    state: 'todo',
    title,
    body: 'Send crypto from your own wallet to your Panoply address. It is how every account is funded.',
    cta: 'Deposit',
  };
}

function flowStep(input: JourneyInput): JourneyStep {
  const title = 'Create your first signal flow';
  if (input.botCount > 0) {
    return { key: 'flow', state: 'done', title, body: 'Your first flow is running.', cta: null };
  }
  // Identity is checked as well as funds because the server refuses a flow to
  // an unverified account whatever its balance (TIER_SLOT_LIMITS.unverified).
  if (!hasFundsInPlay(input) || input.kycStatus !== 'verified') {
    return {
      key: 'flow',
      state: 'locked',
      title,
      body: 'Unlocks once your first deposit is approved.',
      cta: null,
    };
  }
  return {
    key: 'flow',
    state: 'todo',
    title,
    body: 'Choose a pair and a strategy, and allocate part of your balance to it.',
    cta: 'Create signal flow',
  };
}

export function deriveJourney(input: JourneyInput): JourneyStep[] {
  return [
    {
      key: 'account',
      state: 'done',
      title: 'Create your account',
      body: 'Done. Welcome to Panoply.',
      cta: null,
    },
    input.hasPin
      ? { key: 'pin', state: 'done', title: 'Set a sign-in PIN', body: 'Done.', cta: null }
      : {
          key: 'pin',
          state: 'todo',
          title: 'Set a sign-in PIN',
          body: 'A 6-digit PIN asked for after your password, so a stolen password is not enough on its own.',
          cta: 'Set a PIN',
        },
    kycStep(input.kycStatus),
    depositStep(input),
    flowStep(input),
  ];
}

/** The one step that gets the solid button. Waiting steps are not actionable. */
export function activeStepKey(steps: JourneyStep[]): StepKey | null {
  return steps.find((s) => s.state === 'todo' || s.state === 'retry')?.key ?? null;
}

export function isJourneyComplete(steps: JourneyStep[]): boolean {
  return steps.every((s) => s.state === 'done');
}
