import type { Tier } from '@/lib/achievements/engine';

/**
 * How many questions each tier may ask per calendar month.
 *
 * `null` means uncapped. Unverified is zero deliberately: it is not a paywall
 * but an identity gate, and it is the one tier that has proven nothing about
 * who it is. Everyone above it has access, which is the point of moving off
 * the old Vanguard-only lock - a support assistant is most useful to the
 * newest users, and those were exactly the ones the $50,000 threshold shut
 * out.
 *
 * These are constants, not configuration, on purpose: the number of questions
 * a tier is entitled to is a product decision that should be visible in a
 * diff, not something that drifts in an environment variable.
 */
export const COPILOT_TIER_QUOTA: Record<Tier, number | null> = {
  unverified: 0,
  novice: 2,
  amateur: 4,
  strategist: 5,
  vanguard: null,
};

/** First instant of the next calendar month, UTC. When the allowance returns. */
export function quotaResetsAt(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

/**
 * The rate-limit bucket key for one user's monthly allowance.
 *
 * The month is part of the key rather than something a scheduled job clears.
 * A new month is simply a different bucket, so the reset needs no cron, no
 * migration, and cannot half-fail: there is nothing to run.
 */
export function quotaKey(userId: string, now: Date = new Date()): string {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `copilot:${userId}:${month}`;
}

export interface QuotaVerdict {
  allowed: boolean;
  /** Null when uncapped. */
  limit: number | null;
  /** Remaining after this request would be counted. Null when uncapped. */
  remaining: number | null;
  resetsAt: string;
}

/**
 * Decide whether one more question is allowed.
 *
 * Pure: it is handed the count so far and returns a verdict, which keeps the
 * tier rules testable without a database and without the clock.
 */
export function evaluateQuota(input: {
  tier: Tier;
  usedThisMonth: number;
  now?: Date;
}): QuotaVerdict {
  const { tier, usedThisMonth, now = new Date() } = input;
  const limit = COPILOT_TIER_QUOTA[tier];
  const resetsAt = quotaResetsAt(now).toISOString();

  if (limit === null) {
    return { allowed: true, limit: null, remaining: null, resetsAt };
  }

  const allowed = usedThisMonth < limit;
  return {
    allowed,
    limit,
    // Never negative: a stale count from a concurrent write must not render
    // as "-1 questions left".
    remaining: Math.max(0, limit - usedThisMonth - (allowed ? 1 : 0)),
    resetsAt,
  };
}
