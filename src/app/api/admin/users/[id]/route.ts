import { NextRequest, NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { verifyAdminAccess } from '@/lib/auth-middleware';
import { grantAchievement, recalculateTier } from '@/lib/achievements/engine';
import { getSessionFromRequest } from '@/lib/session';
import { getBalanceMinor, post, UserNotFoundError } from '@/lib/ledger';
import { InvalidAmountError, toDollars, toMinor } from '@/lib/money';
import { recordAdminAction } from '@/lib/audit-log';

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
      // walletBalance is deliberately absent. It used to be settable here as a
      // plain field write, which meant an admin could set any balance with no
      // record of who did it or why. It is now handled below as an explicit
      // ledger adjustment carrying the acting admin's id.
    };

    // Filter updates to only allowed fields
    const filteredUpdates: Record<string, unknown> = {};
    for (const [frontendKey, value] of Object.entries(updates)) {
      const dbKey = fieldMap[frontendKey];
      if (dbKey !== undefined) {
        filteredUpdates[dbKey] = value;
      }
    }

    // A balance edit is a movement of capital, not a field update: it is posted
    // as an adjustment entry naming the admin who made it, so the correction is
    // as auditable as the deposit it corrects. The admin supplies a target
    // balance; the ledger records the delta needed to reach it.
    if (updates.walletBalance !== undefined) {
      const session = await getSessionFromRequest(request);

      // A reason is mandatory here and nowhere else. Editing someone's balance
      // by hand is the one administrative action with no legitimate routine
      // use, so it should be impossible to perform without saying why.
      const reason =
        typeof updates.adjustmentReason === 'string' ? updates.adjustmentReason.trim() : '';
      if (!reason) {
        return NextResponse.json(
          { error: 'A reason is required when adjusting a wallet balance.' },
          { status: 400 }
        );
      }

      try {
        const targetMinor = toMinor(updates.walletBalance);
        if (targetMinor < 0) {
          return NextResponse.json({ error: 'Balance cannot be negative.' }, { status: 400 });
        }
        const currentMinor = await getBalanceMinor(id);
        const deltaMinor = targetMinor - currentMinor;
        if (deltaMinor !== 0) {
          await post({
            userId: id,
            type: 'admin_adjustment',
            amountMinor: deltaMinor,
            actorUserId: session?.user.id,
            memo: reason,
          });
          await recordAdminAction(request, {
            action: 'user.balance_adjust',
            targetType: 'user',
            targetId: id,
            before: { walletBalance: toDollars(currentMinor) },
            after: { walletBalance: toDollars(targetMinor) },
            reason,
          });
        }
      } catch (error) {
        if (error instanceof InvalidAmountError) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof UserNotFoundError) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }
        throw error;
      }
    }

    // Fetch pre-update state to detect wallet address transition, and to give
    // the audit trail something to diff against.
    const beforeUpdate = await userModel.findById(id).select('-passwordHash').lean();

    // Update the user
    const updatedUser = await userModel
      .findByIdAndUpdate(id, { $set: filteredUpdates }, { new: true, runValidators: true })
      .select('-passwordHash')
      .lean();

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (Object.keys(filteredUpdates).length > 0) {
      await recordAdminAction(request, {
        action: 'user.update',
        targetType: 'user',
        targetId: id,
        before: beforeUpdate as unknown as Record<string, unknown>,
        after: filteredUpdates,
        reason: typeof updates.adjustmentReason === 'string' ? updates.adjustmentReason : '',
      });
    }

    // Detect wallet address transition and grant achievement
    const walletAddressWasEmpty = !beforeUpdate?.walletAddress;
    const walletAddressNowSet = !!updatedUser.walletAddress;
    if (walletAddressWasEmpty && walletAddressNowSet) {
      await grantAchievement(id, 'wallet_connected');
      // computeTier doesn't read walletAddress, so this is a defensive no-op
      // for tier itself; kept because it also re-checks for a milestone
      // achievement grant if kycStatus/lifetimeDeposited already qualify but
      // the persisted `tier` field hadn't been recalculated yet.
      await recalculateTier(id);
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
      walletBalance: toDollars(updatedUser.walletBalanceMinor || 0),
    };

    return NextResponse.json(formattedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
