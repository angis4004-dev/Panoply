import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { VaultModel } from '@/lib/models';

// GET /api/vaults - Returns all available vaults (public data)
export async function GET() {
  try {
    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Get all vaults (no user filtering - public data)
    const vaults = await VaultModel.find().lean();

    // Transform to match frontend format
    const formattedVaults = vaults.map((vault) => ({
      id: vault._id.toString(),
      name: vault.name,
      strategy: vault.strategy,
      risk: vault.riskLevel, // Map riskLevel to risk for frontend compatibility
      managerScore: vault.managerScore,
      tvl: vault.aum, // Map aum to tvl for frontend compatibility
      apy: vault.apr, // Map apr to apy for frontend compatibility
    }));

    return NextResponse.json(formattedVaults);
  } catch (error) {
    console.error('Error fetching vaults:', error);
    return NextResponse.json({ error: 'Failed to fetch vaults' }, { status: 500 });
  }
}
