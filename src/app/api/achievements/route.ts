import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { UserAchievementModel } from '@/lib/models/UserAchievement';
import { ACHIEVEMENT_CATALOG } from '@/lib/achievements/catalog';
import {
  computeIdentityScore,
  computeTier,
  TIER_DEPOSIT_THRESHOLDS,
  TIER_SLOT_LIMITS,
  type Tier,
} from '@/lib/achievements/engine';

const TIER_SEQUENCE: Tier[] = ['novice', 'amateur', 'strategist', 'vanguard'];

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const user = await userModel
    .findById(session.user.id)
    .select(
      'xp tier kycStatus lifetimeDeposited walletOwnershipConfirmed emailVerified walletAddress profileCompletedAt portfolioReportCount distinctPortfolioAssets distinctBotStrategyTypes visitedSections'
    )
    .lean();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const earnedRecords = await UserAchievementModel.find({ userId: session.user.id })
    .sort({ earnedAt: -1 })
    .lean();
  const earnedMap = new Map(earnedRecords.map((r) => [r.achievementKey, r.earnedAt]));

  const identityScore = computeIdentityScore({
    kycStatus: user.kycStatus,
    walletOwnershipConfirmed: user.walletOwnershipConfirmed,
    emailVerified: user.emailVerified,
    hasWalletAddress: !!user.walletAddress,
    profileCompletedAt: user.profileCompletedAt,
    achievementCount: earnedRecords.length,
  });

  // A small, explicit lookup for the handful of achievements that can show
  // partial progress from counters already on the user document.
  const progressLookup: Partial<Record<string, { current: number; target: number }>> = {
    dashboard_explorer: { current: user.visitedSections?.length || 0, target: 9 },
    asset_explorer: { current: user.distinctPortfolioAssets?.length || 0, target: 5 },
    portfolio_optimizer: { current: user.portfolioReportCount || 0, target: 3 },
    strategy_builder: { current: user.distinctBotStrategyTypes?.length || 0, target: 2 },
  };

  const achievements = ACHIEVEMENT_CATALOG.map((def) => {
    const earnedAt = earnedMap.get(def.key);
    return {
      key: def.key,
      name: def.name,
      description: def.description,
      category: def.category,
      xp: def.xp,
      hasCertificate: def.hasCertificate,
      earned: !!earnedAt,
      earnedAt: earnedAt ? earnedAt.toISOString() : null,
      progress: earnedAt ? null : progressLookup[def.key] || null,
    };
  });

  // Computed live from kycStatus/lifetimeDeposited rather than trusting the
  // cached `tier` field: accounts created before this field existed have no
  // `tier` in their raw Mongo document (Mongoose .lean() does not backfill
  // schema defaults for missing fields), so trusting a stored value would
  // wrongly show already-verified legacy users as unverified.
  const tier = computeTier(user.kycStatus, user.lifetimeDeposited || 0);
  const currentTierIndex = TIER_SEQUENCE.indexOf(tier as Tier);
  const nextTier = currentTierIndex >= 0 ? TIER_SEQUENCE[currentTierIndex + 1] : 'novice';

  // Infinity (vanguard's unlimited slot count) doesn't survive JSON
  // serialization - it becomes null, and the client treats null as unlimited.
  const slotLimit = TIER_SLOT_LIMITS[tier as Tier];

  return NextResponse.json({
    xp: user.xp || 0,
    tier,
    slotLimit: Number.isFinite(slotLimit) ? slotLimit : null,
    identityScore,
    tierProgress: {
      lifetimeDeposited: user.lifetimeDeposited || 0,
      nextTier: nextTier || null,
      nextThreshold: nextTier ? TIER_DEPOSIT_THRESHOLDS[nextTier] : null,
      kycRequired: user.kycStatus !== 'verified',
    },
    achievements,
    recentlyUnlocked: earnedRecords.slice(0, 5).map((r) => ({
      key: r.achievementKey,
      earnedAt: r.earnedAt.toISOString(),
    })),
  });
}
