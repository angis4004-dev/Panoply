'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Brain, Lock } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { TierBadge } from '@/components/dashboard/tier-badge';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * The AI Command Center - a Vanguard-tier feature that is not live yet.
 *
 * This page used to render a fixed example exchange: a hardcoded "Aegis AI"
 * reply naming real protocols and specific yields (Aave USDC 5.2%, Curve
 * 3Pool 8.1%) beside a Send button with no handler. Nothing on the page said
 * it was an illustration, so it read as machine-generated portfolio advice
 * inside a product that takes deposits. There is no model behind it - the
 * codebase makes no LLM call anywhere - so it was removed rather than
 * relabelled.
 *
 * Vanguard users deliberately do not get a working chat here either. The
 * entitlement is real and gated below; the assistant itself is not built.
 * Putting the same canned reply behind a tier check would only move invented
 * financial content behind a threshold rather than take it out.
 */

/**
 * Mirrors TIER_DEPOSIT_THRESHOLDS.vanguard in lib/achievements/engine.ts.
 *
 * Duplicated rather than imported: that module pulls in the Mongoose models,
 * which must not reach the client bundle. app/tiers/page.tsx carries its
 * thresholds the same way for the same reason. Update both if the tier
 * threshold moves.
 */
const VANGUARD_THRESHOLD = 50_000;

interface TierSummary {
  tier: string;
  tierProgress: {
    lifetimeDeposited: number;
    kycRequired: boolean;
  };
}

export default function AIPage() {
  const [summary, setSummary] = useState<TierSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/achievements')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TierSummary | null) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        // Leave summary null - the page falls back to the locked state, which
        // is the safe default: it promises nothing and links to /tiers.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isVanguard = summary?.tier === 'vanguard';
  const deposited = summary?.tierProgress.lifetimeDeposited ?? 0;
  const kycRequired = summary?.tierProgress.kycRequired ?? false;
  const progressPct = Math.min(100, (deposited / VANGUARD_THRESHOLD) * 100);
  const remaining = Math.max(0, VANGUARD_THRESHOLD - deposited);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="AI Command Center"
        description="Natural-language portfolio analysis, available on the Aegis Vanguard tier."
      />

      <div className="mx-auto max-w-2xl">
        {loading ? (
          <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-8">
            <Skeleton className="mb-4 h-12 w-12 rounded-xl" />
            <Skeleton className="mb-3 h-5 w-56" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="mb-6 h-4 w-4/5" />
            <Skeleton className="h-11 w-40 rounded-lg" />
          </div>
        ) : isVanguard ? (
          <div className="rounded-xl border border-green-400/30 bg-ds-surface-raised/50 p-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-green-400/10">
              <Brain className="h-6 w-6 text-green-400" />
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Included in your tier</h2>
              <TierBadge tier="vanguard" />
            </div>

            <p className="text-sm leading-relaxed text-ds-text-muted">
              The AI Command Center is part of your Vanguard tier. It is still being built and is
              not answering questions yet — we would rather show you nothing here than an assistant
              that invents figures. You will keep this access when it opens; nothing further is
              needed from you.
            </p>

            <p className="mt-4 text-sm leading-relaxed text-ds-text-muted">
              In the meantime, the Portfolio Builder runs concentration, diversification and
              target-return checks against your holdings and emails you the breakdown.
            </p>

            <Link
              href="/dashboard/builder"
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
            >
              Run the Portfolio Builder
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-ds-surface-inset">
              <Lock className="h-5 w-5 text-ds-text-muted" />
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">A Vanguard-tier feature</h2>
              {summary && <TierBadge tier={summary.tier} />}
            </div>

            <p className="text-sm leading-relaxed text-ds-text-muted">
              The AI Command Center unlocks at the Aegis Vanguard tier, reached once your lifetime
              deposits cross ${VANGUARD_THRESHOLD.toLocaleString('en-US')}. It is still being built,
              so it is not answering questions yet on any tier.
            </p>

            {kycRequired ? (
              <p className="mt-4 text-sm leading-relaxed text-ds-text-muted">
                Tier progress starts once your identity is verified.{' '}
                <Link
                  href="/dashboard/kyc"
                  className="rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised"
                >
                  Complete verification
                </Link>{' '}
                to begin.
              </p>
            ) : (
              summary && (
                <div className="mt-6">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="font-mono text-sm tabular-nums text-[#E7ECF2]">
                      ${deposited.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs text-ds-text-muted">
                      of ${VANGUARD_THRESHOLD.toLocaleString('en-US')} deposited
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-ds-surface-inset"
                    role="progressbar"
                    aria-valuenow={Math.round(progressPct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progress toward the Vanguard tier"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ds-text-muted">
                    ${remaining.toLocaleString('en-US')} more in lifetime deposits to reach
                    Vanguard.
                  </p>
                </div>
              )
            )}

            <Link
              href="/tiers"
              className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-ds-border px-4 py-2 text-sm font-medium text-[#E7ECF2] hover:border-primary/40 hover:bg-ds-surface-inset transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
            >
              How tiers work
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
