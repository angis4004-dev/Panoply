import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { grantAchievement } from '@/lib/achievements/engine';
import { parseBody, updateProfileSchema } from '@/lib/validation';

export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: body, error: invalid } = await parseBody(request, updateProfileSchema);
  if (invalid) return invalid;
  const name = body.name;

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const existing = await userModel.findById(session.user.id).select('profileCompletedAt').lean();
  if (!existing) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const isFirstSave = !existing.profileCompletedAt;

  await userModel.findByIdAndUpdate(session.user.id, {
    $set: { name, ...(isFirstSave ? { profileCompletedAt: new Date() } : {}) },
  });

  const unlockedAchievements: string[] = [];
  if (isFirstSave) {
    const granted = await grantAchievement(session.user.id, 'profile_complete');
    if (granted) unlockedAchievements.push('profile_complete');
  }

  return NextResponse.json({ name, unlockedAchievements });
}
