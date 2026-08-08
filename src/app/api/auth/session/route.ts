import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { computeTier } from '@/lib/achievements/engine';

// GET /api/auth/session - Returns the current user from the session cookie, or null
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  // kycStatus can change without a re-login (submission, admin review), so
  // it's looked up fresh here rather than embedded in the signed cookie.
  let kycStatus: string | undefined;
  let tier: string | undefined;
  let xp: number | undefined;
  let emailVerified: boolean | undefined;
  let walletOwnershipConfirmed: boolean | undefined;
  let walletAddress: string | undefined;
  let hasPin: boolean | undefined;
  const userModel = await getUserModel();
  if (userModel) {
    const dbUser = await userModel
      .findById(session.user.id)
      .select(
        'kycStatus lifetimeDeposited xp emailVerified walletOwnershipConfirmed walletAddress pinHash'
      )
      .lean();
    kycStatus = dbUser?.kycStatus || 'unverified';
    // Computed live rather than trusting a cached `tier` field: accounts
    // created before this field existed have no `tier` in their raw Mongo
    // document (Mongoose .lean() does not backfill schema defaults for
    // missing fields), so trusting a stored value would wrongly show
    // already-verified legacy users as unverified everywhere on the client.
    tier = computeTier(kycStatus, dbUser?.lifetimeDeposited || 0);
    xp = dbUser?.xp || 0;
    emailVerified = dbUser?.emailVerified || false;
    walletOwnershipConfirmed = dbUser?.walletOwnershipConfirmed || false;
    walletAddress = dbUser?.walletAddress || undefined;
    // Only ever the boolean. The hash itself has no business leaving the
    // server, and the client only needs to know whether to prompt.
    hasPin = Boolean(dbUser?.pinHash);
  }

  return NextResponse.json({
    user: {
      email: session.user.email,
      role: session.user.role,
      name: session.user.name,
      kycStatus,
      tier,
      xp,
      emailVerified,
      walletOwnershipConfirmed,
      walletAddress,
      hasPin,
    },
  });
}
