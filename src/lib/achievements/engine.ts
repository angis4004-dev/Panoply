import { getUserModel } from '@/lib/models';
import { UserAchievementModel } from '@/lib/models/UserAchievement';
import { createNotification } from '@/lib/notifications';
import { ACHIEVEMENT_CATALOG, getAchievementDefinition, type AchievementKey } from './catalog';

export type Tier = 'unverified' | 'novice' | 'amateur' | 'strategist' | 'vanguard';

// Checked in descending order — the first threshold the user's lifetime
// deposit meets or exceeds is their tier.
const TIER_ORDER: { tier: Tier; minDeposited: number }[] = [
  { tier: 'vanguard', minDeposited: 50000 },
  { tier: 'strategist', minDeposited: 10000 },
  { tier: 'amateur', minDeposited: 1000 },
  { tier: 'novice', minDeposited: 0 },
];

export const TIER_DEPOSIT_THRESHOLDS: Record<Exclude<Tier, 'unverified'>, number> = {
  novice: 0,
  amateur: 1000,
  strategist: 10000,
  vanguard: 50000,
};

export const TIER_SLOT_LIMITS: Record<Tier, number> = {
  unverified: 0,
  novice: 1,
  amateur: 3,
  strategist: 6,
  vanguard: Infinity,
};

export const TIER_RANK: Record<Tier, number> = {
  unverified: 0,
  novice: 1,
  amateur: 2,
  strategist: 3,
  vanguard: 4,
};

/**
 * KYC verification gates every tier, including Novice. An unverified user
 * has no tier at all, regardless of how much they've deposited.
 */
export function computeTier(kycStatus: string, lifetimeDeposited: number): Tier {
  if (kycStatus !== 'verified') return 'unverified';
  for (const { tier, minDeposited } of TIER_ORDER) {
    if (lifetimeDeposited >= minDeposited) return tier;
  }
  return 'novice';
}

export interface IdentityScoreInput {
  kycStatus: string;
  walletOwnershipConfirmed: boolean;
  emailVerified: boolean;
  hasWalletAddress: boolean;
  profileCompletedAt?: Date | null;
  twoFactorEnabled?: boolean;
  achievementCount: number;
}

export function computeIdentityScore(input: IdentityScoreInput): number {
  let score = 0;
  if (input.kycStatus === 'verified') score += 30;
  if (input.walletOwnershipConfirmed) score += 15;
  if (input.emailVerified) score += 15;
  if (input.hasWalletAddress) score += 10;
  if (input.profileCompletedAt) score += 10;
  if (input.twoFactorEnabled) score += 10;
  score += Math.min(10, Math.floor(input.achievementCount / 3));
  return score;
}

/**
 * Idempotently grants an achievement. Returns true if this call newly
 * granted it, false if the user already had it. Relies on the unique
 * (userId, achievementKey) index on UserAchievement to make double-granting
 * impossible even under concurrent requests.
 */
export async function grantAchievement(userId: string, key: AchievementKey): Promise<boolean> {
  const definition = getAchievementDefinition(key);

  let newlyGranted = true;
  try {
    await UserAchievementModel.create({
      userId,
      achievementKey: key,
      xpAwarded: definition.xp,
    });
  } catch (error) {
    const isDuplicateKeyError =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000;
    if (!isDuplicateKeyError) throw error;
    newlyGranted = false;
  }

  if (newlyGranted) {
    const userModel = await getUserModel();
    if (userModel) {
      await userModel.findByIdAndUpdate(userId, { $inc: { xp: definition.xp } });
    }
  }

  // Every unlock in the application passes through here, so announcing it
  // here means no caller can add a new one and forget to.
  //
  // Attempted on every call, including ones that granted nothing, rather than
  // only on a new grant. Granting and announcing are two writes: if the second
  // fails, an early return on the duplicate would mean the user is never told
  // about an unlock they hold, permanently, because the grant that would have
  // announced it can never happen again. Retrying unconditionally repairs
  // that, and the dedupe key - not this control flow - is what stops the
  // repair from announcing the same unlock twice.
  //
  // The cost is one insert that the index rejects, on calls where the user
  // already had the achievement.
  await createNotification({
    userId,
    type: 'achievement',
    title: definition.name,
    body: `${definition.description} +${definition.xp} XP`,
    href: '/dashboard/achievements',
    dedupeKey: `achievement:${key}`,
  });

  // Any achievement outside Getting Started also counts as the player's
  // "first feature unlock" milestone — guarded against re-triggering itself.
  // Still gated on a new grant: the cascade is about earning the milestone,
  // not about repairing it, and running it on every replay would double the
  // write amplification above for no benefit.
  if (newlyGranted && key !== 'first_feature_unlock' && definition.category !== 'getting-started') {
    await grantAchievement(userId, 'first_feature_unlock');
  }

  return newlyGranted;
}

const TIER_MILESTONE_ACHIEVEMENT: Partial<Record<Tier, AchievementKey>> = {
  amateur: 'amateur_tier_achieved',
  strategist: 'strategist_tier_achieved',
  vanguard: 'vanguard_tier_achieved',
};

/**
 * Recomputes and persists the user's tier from their current KYC status and
 * lifetime deposited amount, granting the matching tier-milestone
 * achievement on any upward change. Never downgrades on a no-op call —
 * lifetimeDeposited only increases, so in practice this only fires forward,
 * but the rank check guards against the KYC-status-reverted edge case too.
 */
export async function recalculateTier(userId: string): Promise<void> {
  const userModel = await getUserModel();
  if (!userModel) return;

  const user = await userModel.findById(userId).select('kycStatus lifetimeDeposited tier').lean();
  if (!user) return;

  const newTier = computeTier(user.kycStatus, user.lifetimeDeposited || 0);
  if (newTier === user.tier) return;

  await userModel.findByIdAndUpdate(userId, { $set: { tier: newTier } });

  const previousRank = TIER_RANK[(user.tier as Tier) || 'unverified'];
  const newRank = TIER_RANK[newTier];
  if (newRank <= previousRank) return;

  const milestoneKey = TIER_MILESTONE_ACHIEVEMENT[newTier];
  if (milestoneKey) {
    await grantAchievement(userId, milestoneKey);
  }
}

export { ACHIEVEMENT_CATALOG };
