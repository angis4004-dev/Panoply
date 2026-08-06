import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { grantAchievement } from '@/lib/achievements/engine';
// Single definition, shared with the schema that validates the section name -
// the list and the thing that checks against it cannot drift apart.
import { parseBody, TRACKED_SECTIONS, visitSectionSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: body, error: invalid } = await parseBody(request, visitSectionSchema);
  if (invalid) return invalid;
  const section = body.section;

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  await userModel.findByIdAndUpdate(session.user.id, { $addToSet: { visitedSections: section } });

  const unlockedAchievements: string[] = [];

  if (section === 'ai') {
    const granted = await grantAchievement(session.user.id, 'signal_explorer');
    if (granted) unlockedAchievements.push('signal_explorer');
  }

  if (section === 'history') {
    const granted = await grantAchievement(session.user.id, 'analytics_explorer');
    if (granted) unlockedAchievements.push('analytics_explorer');
  }

  const user = await userModel.findById(session.user.id).select('visitedSections').lean();
  if (user && TRACKED_SECTIONS.every((s) => user.visitedSections.includes(s))) {
    const granted = await grantAchievement(session.user.id, 'dashboard_explorer');
    if (granted) unlockedAchievements.push('dashboard_explorer');
  }

  return NextResponse.json({ unlockedAchievements });
}
