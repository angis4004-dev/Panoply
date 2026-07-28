import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { grantAchievement } from '@/lib/achievements/engine';

export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }

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
