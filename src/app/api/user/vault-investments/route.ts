import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { connectToDatabase } from '@/lib/mongo';
import { VaultModel } from '@/lib/models/Vault';
import { UserVaultInvestmentModel } from '@/lib/models/UserVaultInvestment';
import { InsufficientFundsError, withLedger } from '@/lib/ledger';
import { InvalidAmountError, toDollars, toPositiveMinor } from '@/lib/money';

interface PopulatedVaultRef {
  _id: { toString(): string };
  name: string;
  strategy: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  managerScore: number;
  aum: string;
  apr: number;
}

export async function GET(request: NextRequest) {
  try {
    // Get session to identify the current user
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Get user's vault investments with vault details
    const userInvestments = await UserVaultInvestmentModel.find({ userId })
      .populate('vaultId', 'name strategy riskLevel managerScore aum apr')
      .lean();

    // Transform to match frontend format
    const formattedInvestments = userInvestments.map((inv) => {
      const vault = inv.vaultId as unknown as PopulatedVaultRef;
      return {
        id: inv._id.toString(),
        vaultId: vault._id.toString(),
        vaultName: vault.name,
        strategy: vault.strategy,
        riskLevel: vault.riskLevel,
        managerScore: vault.managerScore,
        tvl: vault.aum,
        apy: vault.apr,
        investedAmount: inv.amount,
        vaultTokens: inv.share,
        investedAt: inv.investedAt,
      };
    });

    return NextResponse.json(formattedInvestments);
  } catch (error) {
    console.error('Error fetching user vault investments:', error);
    return NextResponse.json({ error: 'Failed to fetch vault investments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get session to identify the current user
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const body = await request.json();
    const { vaultId, amount } = body;

    // Validate required fields
    if (!vaultId) {
      return NextResponse.json({ error: 'Vault ID is required' }, { status: 400 });
    }

    let amountMinor: number;
    try {
      amountMinor = toPositiveMinor(amount);
    } catch (error) {
      if (error instanceof InvalidAmountError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Check if vault exists
    const vault = await VaultModel.findById(vaultId);
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }

    // Check if user already has an investment in this vault
    const existingInvestment = await UserVaultInvestmentModel.findOne({
      userId,
      vaultId,
    });

    if (existingInvestment) {
      return NextResponse.json(
        {
          error:
            'You already have an investment in this vault. Use the update endpoint to modify your investment.',
        },
        { status: 409 }
      );
    }

    // Calculate vault tokens received (simplified - in reality this would depend on current vault price)
    // For simplicity, we'll assume 1 USD = 1 vault token
    const investedAmount = toDollars(amountMinor);
    const vaultTokens = investedAmount;

    // This path previously created the position without touching the wallet at
    // all, so any user could open a position of any size with a zero balance.
    // It now debits through the same ledger as signal-flow allocation, in one
    // transaction with the position it funds.
    let savedInvestment;
    try {
      savedInvestment = await withLedger(async (tx) => {
        const [investment] = await UserVaultInvestmentModel.create(
          [{ userId, vaultId, amount: investedAmount, share: vaultTokens }],
          { session: tx.session }
        );

        await tx.post({
          userId,
          type: 'allocation',
          amountMinor: -amountMinor,
          relatedEntityType: 'vault',
          relatedEntityId: investment._id,
          memo: `Investment in vault ${vault.name}`,
        });

        return investment;
      });
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        return NextResponse.json(
          { error: 'Insufficient wallet balance. Deposit more funds before investing.' },
          { status: 400 }
        );
      }
      throw error;
    }

    return NextResponse.json(
      {
        id: savedInvestment._id.toString(),
        vaultId: savedInvestment.vaultId.toString(),
        amount: savedInvestment.amount,
        vaultTokens: savedInvestment.share,
        investedAt: savedInvestment.investedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating vault investment:', error);
    return NextResponse.json({ error: 'Failed to create vault investment' }, { status: 500 });
  }
}
