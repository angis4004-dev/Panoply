import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';

// GET /api/auth/session - Returns the current user from the session cookie, or null
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  // kycStatus can change without a re-login (submission, admin review), so
  // it's looked up fresh here rather than embedded in the signed cookie.
  let kycStatus: string | undefined;
  const userModel = await getUserModel();
  if (userModel) {
    const dbUser = await userModel.findById(session.user.id).select('kycStatus').lean();
    kycStatus = dbUser?.kycStatus || 'unverified';
  }

  return NextResponse.json({
    user: {
      email: session.user.email,
      role: session.user.role,
      name: session.user.name,
      kycStatus,
    },
  });
}
