'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/use-auth';
import { VerifyIcon } from '@/components/ui/panoply-icons';
import { TierLadder } from '@/components/dashboard/card-marks';
import {
  CARD_FIGURE,
  CARD_LABEL,
  CARD_META,
  CardChip,
  OverviewCard,
} from '@/components/dashboard/overview-card';

/**
 * Identity: tier, verification and progress toward the next tier.
 *
 * It owns its own request (/api/achievements) and nothing else on the Overview
 * reads that data. It sits in the first row of the Overview's card grid beside
 * the wallet, and draws the whole tier path so a trader sees where they are
 * on it, not just the name of the step.
 */

interface IdentitySummary {
  xp: number;
  tier: string;
  identityScore: number;
  tierProgress: {
    lifetimeDeposited: number;
    nextTier: string | null;
    nextThreshold: number | null;
    kycRequired: boolean;
  };
}

/** The tier order, lowest first. Matches TIER_RANK in lib/achievements/engine. */
const TIERS = ['unverified', 'novice', 'amateur', 'strategist', 'vanguard'];

function titleCase(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

const KYC = {
  unverified: { label: 'Not verified', tone: 'text-ds-value-warning bg-ds-value-warning/10' },
  pending: { label: 'Under review', tone: 'text-ds-value-warning bg-ds-value-warning/10' },
  verified: { label: 'Verified', tone: 'text-ds-value-positive bg-ds-value-positive/10' },
  rejected: { label: 'Action required', tone: 'text-ds-value-negative bg-ds-value-negative/10' },
} as const;

export function IdentityTierCard() {
  const { user } = useAuth();
  const [identity, setIdentity] = useState<IdentitySummary | null>(null);
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityError, setIdentityError] = useState(false);
  const [identityRetry, setIdentityRetry] = useState(0);

  useEffect(() => {
    setIdentityLoading(true);
    setIdentityError(false);
    fetch('/api/achievements')
      .then((res) => {
        if (!res.ok) throw new Error('Identity request failed');
        return res.json();
      })
      .then(setIdentity)
      .catch(() => {
        setIdentity(null);
        setIdentityError(true);
      })
      .finally(() => setIdentityLoading(false));
  }, [identityRetry]);

  const kycStatus = (user?.kycStatus ?? 'unverified') as keyof typeof KYC;
  const kyc = KYC[kycStatus] ?? KYC.unverified;
  const tier = (identity?.tier || user?.tier || 'unverified').toLowerCase();
  const current = Math.max(0, TIERS.indexOf(tier));
  const progress = identity?.tierProgress;
  const fraction =
    progress?.nextThreshold && progress.nextThreshold > 0
      ? progress.lifetimeDeposited / progress.nextThreshold
      : 1;

  return (
    <OverviewCard className="md:col-span-2 md:min-h-[260px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CardChip>
            <VerifyIcon />
          </CardChip>
          <span className={CARD_LABEL}>Identity</span>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${kyc.tone}`}>
          {kyc.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <p className={CARD_FIGURE}>{titleCase(tier)}</p>
        {identityLoading ? (
          <Skeleton className="h-4 w-24" />
        ) : identity ? (
          <span className="pb-1 font-mono text-[13px] tabular-nums text-ds-text-muted">
            Score {identity.identityScore} · {identity.xp.toLocaleString()} XP
          </span>
        ) : null}
      </div>

      <TierLadder tiers={TIERS.map(titleCase)} current={current} progress={fraction} />

      <div className="mt-auto grid gap-1.5">
        {identityError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-ds-value-negative">Identity score unavailable.</p>
            <button
              type="button"
              onClick={() => setIdentityRetry((value) => value + 1)}
              className="text-xs font-semibold text-primary underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : progress?.kycRequired ? (
          <p className={CARD_META}>Complete KYC verification to unlock tier progress.</p>
        ) : progress?.nextTier && progress.nextThreshold != null ? (
          <p className={CARD_META}>
            ${progress.lifetimeDeposited.toLocaleString()} of $
            {progress.nextThreshold.toLocaleString()} deposited toward{' '}
            {titleCase(progress.nextTier)}
          </p>
        ) : identity ? (
          <p className={CARD_META}>Highest tier reached.</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-5">
          {kycStatus === 'unverified' || kycStatus === 'rejected' ? (
            <Link
              href="/dashboard/kyc"
              className="inline-flex min-h-[44px] items-center text-[13px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {kycStatus === 'rejected' ? 'Review verification' : 'Verify identity'}
            </Link>
          ) : null}
          <Link
            href="/dashboard/achievements"
            className="inline-flex min-h-[44px] items-center text-[13px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            {progress?.nextTier
              ? `See what ${titleCase(progress.nextTier)} unlocks`
              : 'View achievements'}
          </Link>
        </div>
      </div>
    </OverviewCard>
  );
}
