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

    // Transform to match frontend format. Only include fields backed by real
    // data - the schema has no TVL, audit, volume, or utilization data yet,
    // so those aren't fabricated here anymore (see YieldOpportunity model).
    const formattedYields = yields.map((yieldOp) => ({
      id: yieldOp._id.toString(),
      protocol: yieldOp.protocol,
      chain: yieldOp.chain,
      apy: yieldOp.apr30d, // Using 30d APR as APY for simplicity
      tvl: null,
      risk: yieldOp.riskLevel,
    }));

    return NextResponse.json(formattedYields);
  } catch (error) {
    console.error('Error fetching yield opportunities:', error);
    return NextResponse.json({ error: 'Failed to fetch yield opportunities' }, { status: 500 });
  }
}
