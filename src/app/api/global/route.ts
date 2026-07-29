import { NextResponse } from 'next/server';
import { getGlobalMarketData } from '@/lib/coingecko';

/**
 * GET /api/global
 * Get global cryptocurrency market data
 */
export async function GET() {
  try {
    const data = await getGlobalMarketData();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in /api/global route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
