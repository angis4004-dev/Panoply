'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { IdentityScore } from '@/components/dashboard/identity-score';
import { TierBadge } from '@/components/dashboard/tier-badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/use-auth';

/**
 * Identity score, tier and KYC status, with progress toward the next tier.
 *
 * Moved out of the Overview page unchanged, to bring the page back under the
 * project's 500-line limit. It owns its own request (/api/achievements) and
 * nothing else on the Overview reads that data, so it was already a separate
 * component in everything but location.
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

  const kycStatus = user?.kycStatus ?? 'unverified';
  const kycStatusLabel = {
    unverified: 'Not verified',
    pending: 'Under review',
    verified: 'Verified',
    rejected: 'Action required',
  }[kycStatus];

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-xl border border-ds-border bg-ds-surface-raised/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-center gap-4">
        {identityLoading ? (
          <Skeleton className="h-14 w-40" />
        ) : (
          <IdentityScore score={identity?.identityScore ?? 0} size="sm" />
        )}
        <div>
          <div className="mb-1 flex items-center gap-2">
            <TierBadge tier={identity?.tier || user?.tier || 'unverified'} />
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                kycStatus === 'verified'
                  ? 'bg-ds-value-positive/10 text-ds-value-positive'
                  : kycStatus === 'rejected'
                    ? 'bg-ds-value-negative/10 text-ds-value-negative'
                    : 'bg-ds-value-warning/10 text-ds-value-warning'
              }`}
            >
              KYC: {kycStatusLabel}
            </span>
            {identity && (
              <span className="font-mono text-sm font-semibold text-ds-text">{identity.xp} XP</span>
            )}
          </div>
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
          ) : identity?.tierProgress.kycRequired ? (
            <p className="text-xs text-ds-text-muted">
              Complete KYC verification to unlock tier progress.
            </p>
          ) : identity?.tierProgress.nextTier && identity.tierProgress.nextThreshold != null ? (
            <p className="text-xs text-ds-text-muted">
              ${identity.tierProgress.lifetimeDeposited.toLocaleString()} of $
              {identity.tierProgress.nextThreshold.toLocaleString()} deposited toward{' '}
              {identity.tierProgress.nextTier}
            </p>
          ) : identity ? (
            <p className="text-xs text-ds-text-muted">Highest tier reached.</p>
          ) : null}
          {kycStatus === 'unverified' || kycStatus === 'rejected' ? (
            <Link
              href="/dashboard/kyc"
              className="mt-1 inline-flex min-h-[32px] items-center text-xs font-semibold text-primary underline underline-offset-2"
            >
              {kycStatus === 'rejected' ? 'Review verification' : 'Verify identity'}
            </Link>
          ) : null}
        </div>
      </div>
      <Link
        href="/dashboard/achievements"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded text-ds-label font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised"
      >
        View achievements
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
