/**
 * The rules governing a deposit decision, with no database in sight.
 *
 * Kept separate from src/lib/admin/deposits.ts, which does the transactional
 * work, so that "an approved deposit cannot be approved again" and "a credit
 * needs an amount and a reference" are propositions a test can hold rather
 * than behaviours only reachable through a live Mongo replica set.
 */

import type { DepositStatus } from '@/lib/models/Deposit';

export class DepositTransitionError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = 'DepositTransitionError';
    this.status = status;
  }
}

/**
 * Only a pending deposit can be decided, and it can be decided once.
 *
 * Re-approval is the failure that matters: two reviewers opening the same
 * queue item, or one reviewer double-clicking, must not produce two credits.
 * The database write is guarded on `status: 'pending'` as well - this check
 * gives the caller a usable message, the filter guarantees the outcome.
 */
export function assertDecidable(current: DepositStatus): void {
  if (current === 'pending') return;
  throw new DepositTransitionError(
    current === 'approved'
      ? 'This deposit has already been authorized and credited.'
      : 'This deposit has already been rejected.'
  );
}

export interface ApprovalInput {
  creditAmountMinor: unknown;
  txReference: unknown;
  reviewNote?: unknown;
}

export interface ApprovalPlan {
  creditAmountMinor: number;
  txReference: string;
  reviewNote: string;
}

/**
 * Upper bound on a single authorization, in minor units.
 *
 * A hundred million dollars. Not a business rule about deposit sizes - it is a
 * guard against a mistyped amount or a units error, which is the realistic way
 * an absurd credit gets posted. Anything genuinely larger deserves a
 * conversation rather than a form submission.
 */
export const MAX_CREDIT_MINOR = 10_000_000_000;

/**
 * Validates an approval before any money moves.
 *
 * A transaction reference is mandatory. The whole point of the pending state
 * is that somebody checked the chain; recording the approval without recording
 * what was checked reduces the queue to a rubber stamp with an audit trail
 * that cannot be verified against anything.
 */
export function planApproval(input: ApprovalInput): ApprovalPlan {
  const amount = input.creditAmountMinor;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) {
    throw new DepositTransitionError('A credit amount in whole minor units is required.', 400);
  }
  if (amount <= 0) {
    throw new DepositTransitionError('The credit amount must be greater than zero.', 400);
  }
  if (amount > MAX_CREDIT_MINOR) {
    throw new DepositTransitionError(
      'The credit amount exceeds the single-authorization limit. Check the units.',
      400
    );
  }

  const reference = typeof input.txReference === 'string' ? input.txReference.trim() : '';
  if (reference.length < 6) {
    throw new DepositTransitionError(
      'A transaction reference is required to authorize a deposit.',
      400
    );
  }

  return {
    creditAmountMinor: amount,
    txReference: reference,
    reviewNote: typeof input.reviewNote === 'string' ? input.reviewNote.trim() : '',
  };
}

/**
 * Validates a rejection.
 *
 * A reason is mandatory for the same reason it is on a KYC rejection: the
 * trader is told their transfer was refused, and "rejected" on its own leaves
 * them with nothing to act on and a support ticket to write.
 */
export function planRejection(reason: unknown): string {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed.length < 4) {
    throw new DepositTransitionError('A reason is required to reject a deposit.', 400);
  }
  return trimmed;
}

/**
 * The ledger idempotency key for a deposit credit.
 *
 * Derived from the deposit id and nothing else, so a retried authorization -
 * a timeout the reviewer resubmits, a duplicated request - collides on the
 * ledger's unique index and posts nothing the second time.
 */
export function depositIdempotencyKey(depositId: string): string {
  return `deposit:${depositId}`;
}
