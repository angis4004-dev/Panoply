import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { YieldOpportunityModel } from '@/lib/models';

// GET /api/yield - Returns all yield opportunities (public data)
export async function GET() {
  try {
    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Get all yield opportunities (no filtering - public data)
    const yields = await YieldOpportunityModel.find().lean();

    // Transform to match frontend format
    const formattedYields = yields.map((yieldOp) => ({
      id: yieldOp._id.toString(),
      protocol: yieldOp.protocol,
      chain: yieldOp.chain,
      apy: yieldOp.apr30d, // Using 30d APR as APY for simplicity
      tvl: 'N/A', // Placeholder - schema has no TVL field yet
      change24h: 0, // Placeholder - would need to calculate from historical data
      risk: yieldOp.riskLevel,
      audit: 'CertiK', // Placeholder
      tokens: [yieldOp.protocol], // Simplified
      impermanentLoss: 'Low', // Placeholder
      lockPeriod: 'Flexible',
      minDeposit: '$10',
      fee: '0.05%',
      dailyVolume: '$5M', // Placeholder
      utilRate: '65%', // Placeholder
      description: `Earn yield on ${yieldOp.protocol} via ${yieldOp.chain}`,
    }));

    return NextResponse.json(formattedYields);
  } catch (error) {
    console.error('Error fetching yield opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch yield opportunities' }, { status: 500 });
  }
}
