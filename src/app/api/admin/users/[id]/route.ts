import { NextRequest, NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { verifyAdminAccess } from '@/lib/auth-middleware';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Verify admin access
  const authResponse = await verifyAdminAccess(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;

    // Parse request body
    const updates = await request.json();

    // Validate ObjectId
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Define which frontend fields are allowed and their corresponding database fields
    const fieldMap: Record<string, string> = {
      risk: 'riskProfile',
      value: 'portfolioValue',
      wallet: 'walletAddress',
      name: 'name',
      email: 'email',
      riskProfile: 'riskProfile',
      status: 'status',
      bots: 'bots',
      portfolioValue: 'portfolioValue',
      walletAddress: 'walletAddress',
      notes: 'notes',
      walletBalance: 'walletBalance',
    };

    // Filter updates to only allowed fields
    const filteredUpdates: Record<string, unknown> = {};
    for (const [frontendKey, value] of Object.entries(updates)) {
      const dbKey = fieldMap[frontendKey];
      if (dbKey !== undefined) {
        filteredUpdates[dbKey] = value;
      }
    }

    // Update the user
    const updatedUser = await userModel
      .findByIdAndUpdate(id, { $set: filteredUpdates }, { new: true, runValidators: true })
      .select('-passwordHash')
      .lean();

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Transform to match frontend format
    const formattedUser = {
      id: updatedUser._id.toString(),
      name: updatedUser.name,
      email: updatedUser.email,
      risk: updatedUser.riskProfile || 'Balanced',
      bots: updatedUser.bots || 0,
      value: updatedUser.portfolioValue || '$0',
      status: updatedUser.status || 'active',
      joined: updatedUser.createdAt
        ? new Date(updatedUser.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : 'Unknown',
      wallet: updatedUser.walletAddress || '',
      notes: updatedUser.notes || '',
      walletBalance: updatedUser.walletBalance || 0,
    };

    return NextResponse.json(formattedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
