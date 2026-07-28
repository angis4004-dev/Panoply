import { NextRequest, NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { verifyAdminAccess } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  // Verify admin access
  const authResponse = await verifyAdminAccess(request);
  if (authResponse) return authResponse;

  try {
    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const users = await userModel.find({}, { passwordHash: 0 }).lean();

    // Transform to match the format expected by the frontend
    const formattedUsers = users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      risk: user.riskProfile || 'Balanced', // Default if not set
      bots: user.bots || 0, // Default if not set
      value: user.portfolioValue || '$0', // Default if not set
      status: user.status || 'active',
      joined: user.createdAt
        ? new Date(user.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : 'Unknown',
      wallet: user.walletAddress || '',
      notes: user.notes || '',
      walletBalance: user.walletBalance || 0,
    }));

    return NextResponse.json(formattedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
