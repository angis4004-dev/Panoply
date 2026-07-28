import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { recalculateTier } from '@/lib/achievements/engine';

// GET /api/wallet - Returns the current user's wallet balance
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const user = await userModel.findById(session.user.id).select('walletBalance').lean();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ balance: user.walletBalance || 0 });
}

// POST /api/wallet - Deposit funds into the current user's wallet balance
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { amount } = body;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
  }

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const user = await userModel.findById(session.user.id).select('kycStatus').lean();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (user.kycStatus !== 'verified') {
    return NextResponse.json(
      { error: 'Complete identity verification before depositing funds.' },
      { status: 403 }
    );
  }

  const updated = await userModel
    .findByIdAndUpdate(
      session.user.id,
      { $inc: { walletBalance: amount, lifetimeDeposited: amount } },
      { new: true }
    )
    .select('walletBalance')
    .lean();

  await recalculateTier(session.user.id);

  return NextResponse.json({ balance: updated?.walletBalance || 0 });
}
