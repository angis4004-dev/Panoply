'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard/page-header';
import { IdentityScore } from '@/components/dashboard/identity-score';
import { TierBadge } from '@/components/dashboard/tier-badge';
import {
  AchievementCard,
  type AchievementViewModel,
} from '@/components/dashboard/achievement-card';
import { CertificateModal } from '@/components/dashboard/certificate-modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/use-auth';
import type { AchievementCategory } from '@/lib/achievements/catalog';

interface AchievementsResponse {
  xp: number;
  tier: string;
  identityScore: number;
  tierProgress: {
    lifetimeDeposited: number;
    nextTier: string | null;
    nextThreshold: number | null;
    kycRequired: boolean;
  };
  achievements: AchievementViewModel[];
  recentlyUnlocked: { key: string; earnedAt: string }[];
}

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  'getting-started': 'Getting Started',
  'security-trust': 'Security & Trust',
  portfolio: 'Portfolio Management',
  'strategy-analytics': 'Strategy & Analytics',
  engagement: 'Engagement',
  milestones: 'Milestones',
};
const CATEGORY_ORDER: AchievementCategory[] = [
  'getting-started',
  'security-trust',
  'portfolio',
  'strategy-analytics',
  'engagement',
  'milestones',
];

export default function AchievementsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [certificateFor, setCertificateFor] = useState<AchievementViewModel | null>(null);

  useEffect(() => {
    fetch('/api/achievements')
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Achievements"
        description="Track your progress, milestones, and platform trust score."
      />

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ) : !data ? (
        <p className="text-sm text-ds-text-muted">Unable to load achievements right now.</p>
      ) : (
        <>
          <div className="mb-8 flex flex-col gap-4 rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <IdentityScore score={data.identityScore} />
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <TierBadge tier={data.tier} />
                  <span className="font-mono text-sm font-semibold text-white">{data.xp} XP</span>
                </div>
                {data.tierProgress.kycRequired ? (
                  <p className="text-xs text-ds-text-muted">
                    Complete KYC verification to unlock tier progress.
                  </p>
                ) : data.tierProgress.nextTier && data.tierProgress.nextThreshold != null ? (
                  <p className="text-xs text-ds-text-muted">
                    ${data.tierProgress.lifetimeDeposited.toLocaleString()} of $
                    {data.tierProgress.nextThreshold.toLocaleString()} deposited toward{' '}
                    {data.tierProgress.nextTier}
                  </p>
                ) : (
                  <p className="text-xs text-ds-text-muted">Highest tier reached.</p>
                )}
              </div>
            </div>
          </div>

          {CATEGORY_ORDER.map((category) => {
            const items = data.achievements.filter((a) => a.category === category);
            if (items.length === 0) return null;
            return (
              <section key={category} className="mb-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ds-text-muted">
                  {CATEGORY_LABELS[category]}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((achievement) => (
                    <AchievementCard
                      key={achievement.key}
                      achievement={achievement}
                      onViewCertificate={
                        achievement.hasCertificate
                          ? () => setCertificateFor(achievement)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}

      {certificateFor && certificateFor.earnedAt && (
        <CertificateModal
          name={user?.name || 'Aegis User'}
          achievementName={certificateFor.name}
          earnedAt={certificateFor.earnedAt}
          onClose={() => setCertificateFor(null)}
        />
      )}
    </div>
  );
}
