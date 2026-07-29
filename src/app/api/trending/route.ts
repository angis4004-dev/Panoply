import { NextResponse } from 'next/server';
import { getTrendingCoins } from '@/lib/coingecko';

/**
 * GET /api/trending
 * Get trending cryptocurrencies
 */
export async function GET() {
  try {
    const data = await getTrendingCoins();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in /api/trending route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
