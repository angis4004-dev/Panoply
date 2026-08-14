import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { getUserModel } from '@/lib/models';
import { grantAchievement, recalculateTier } from '@/lib/achievements/engine';

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const user = await userModel
    .findById(session.user.id)
    .select('walletAddress walletOwnershipConfirmed kycStatus')
    .lean();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (!user.walletAddress) {
    return NextResponse.json(
      { error: 'No wallet address has been assigned to your account yet.' },
      { status: 400 }
    );
  }

  if (!user.walletOwnershipConfirmed) {
    await userModel.findByIdAndUpdate(session.user.id, {
      $set: { walletOwnershipConfirmed: true, walletOwnershipConfirmedAt: new Date() },
    });
  }

  const unlockedAchievements: string[] = [];
  const grantedOwnership = await grantAchievement(session.user.id, 'wallet_ownership_verified');
  if (grantedOwnership) unlockedAchievements.push('wallet_ownership_verified');

  if (user.kycStatus === 'verified') {
    const grantedChampion = await grantAchievement(session.user.id, 'security_champion');
    if (grantedChampion) unlockedAchievements.push('security_champion');
  }

  await recalculateTier(session.user.id);

  return NextResponse.json({ walletOwnershipConfirmed: true, unlockedAchievements });
}
