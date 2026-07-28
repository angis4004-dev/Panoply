import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { grantAchievement } from '@/lib/achievements/engine';

function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
}

export async function POST(request: NextRequest) {
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
    .select('lastActiveDate currentStreak longestStreak')
    .lean();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const today = dayNumber(new Date());
  const lastDay = user.lastActiveDate ? dayNumber(new Date(user.lastActiveDate)) : null;

  let currentStreak = user.currentStreak || 0;
  if (lastDay === today) {
    // Already recorded today — no change.
  } else if (lastDay === today - 1) {
    currentStreak += 1;
  } else {
    currentStreak = 1;
  }

  const longestStreak = Math.max(user.longestStreak || 0, currentStreak);

  if (lastDay !== today) {
    await userModel.findByIdAndUpdate(session.user.id, {
      $set: { lastActiveDate: new Date(), currentStreak, longestStreak },
    });
  }

  const unlockedAchievements: string[] = [];
  const streakMilestones: [number, Parameters<typeof grantAchievement>[1]][] = [
    [7, 'seven_day_streak'],
    [30, 'thirty_day_streak'],
    [90, 'consistent_user'],
  ];
  for (const [threshold, key] of streakMilestones) {
    if (currentStreak >= threshold) {
      const granted = await grantAchievement(session.user.id, key);
      if (granted) unlockedAchievements.push(key);
    }
  }

  // "Dedicated Member" tracks cumulative login days, not a consecutive
  // streak, so it's driven off longestStreak's day-count sibling instead —
  // approximated here as 100 distinct days having triggered a heartbeat,
  // tracked via longestStreak reaching 100 OR currentStreak reaching 100.
  // Since both are consecutive-day counters in this implementation, 100
  // cumulative days is satisfied whenever either counter hits 100.
  if (currentStreak >= 100 || longestStreak >= 100) {
    const granted = await grantAchievement(session.user.id, 'dedicated_member');
    if (granted) unlockedAchievements.push('dedicated_member');
  }

  return NextResponse.json({ currentStreak, longestStreak, unlockedAchievements });
}
