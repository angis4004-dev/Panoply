import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/mongo';
import { VaultModel } from '@/lib/models/Vault';
import { UserVaultInvestmentModel } from '@/lib/models/UserVaultInvestment';

export async function GET(request: NextRequest) {
  try {
    // Get session to identify the current user
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const UserModel = await getUserModel();
    const userVaultInvestmentModel = await UserVaultInvestmentModel;
    const vaultModel = await VaultModel;

    if (!userVaultInvestmentModel || !vaultModel) {
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 503 }
      );
    }

    // Get user's vault investments with vault details
    const userInvestments = await userVaultInvestmentModel.find({ userId })
      .populate('vaultId', 'name strategy riskLevel managerScore aum apr')
      .lean();

    // Transform to match frontend format
    const formattedInvestments = userInvestments.map((inv: any) => ({
      id: inv._id.toString(),
      vaultId: inv.vaultId._id.toString(),
      vaultName: inv.vaultId.name,
      strategy: inv.vaultId.strategy,
      riskLevel: inv.vaultId.riskLevel,
      managerScore: inv.vaultId.managerScore,
      tvl: inv.vaultId.aum,
      apy: inv.vaultId.apr,
      investedAmount: inv.amount,
      vaultTokens: inv.share,
      investedAt: inv.investedAt
    }));

    return NextResponse.json(formattedInvestments);
  } catch (error) {
    console.error('Error fetching user vault investments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vault investments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get session to identify the current user
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const body = await request.json();
    const { vaultId, amount } = body;

    // Validate required fields
    if (!vaultId) {
      return NextResponse.json(
        { error: 'Vault ID is required' },
        { status: 400 }
      );
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    const UserModel = await getUserModel();
    const userVaultInvestmentModel = await UserVaultInvestmentModel;
    const vaultModel = await VaultModel;

    if (!userVaultInvestmentModel || !vaultModel) {
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 503 }
      );
    }

    // Check if vault exists
    const vault = await vaultModel.findById(vaultId);
    if (!vault) {
      return NextResponse.json(
        { error: 'Vault not found' },
        { status: 404 }
      );
    }

    // Check if user already has an investment in this vault
    const existingInvestment = await userVaultInvestmentModel.findOne({
      userId,
      vaultId
    });

    if (existingInvestment) {
      return NextResponse.json(
        { error: 'You already have an investment in this vault. Use the update endpoint to modify your investment.' },
        { status: 409 }
      );
    }

    // Calculate vault tokens received (simplified - in reality this would depend on current vault price)
    // For simplicity, we'll assume 1 USD = 1 vault token
    const vaultTokens = amount;

    // Create new investment
    const newInvestment = new userVaultInvestmentModel({
      userId,
      vaultId,
      amount,
      share: vaultTokens
    });

    const savedInvestment = await newInvestment.save();

    return NextResponse.json({
      id: savedInvestment._id.toString(),
      vaultId: savedInvestment.vaultId.toString(),
      amount: savedInvestment.amount,
      vaultTokens: savedInvestment.share,
      investedAt: savedInvestment.investedAt
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating vault investment:', error);
    return NextResponse.json(
      { error: 'Failed to create vault investment' },
      { status: 500 }
    );
  }
}