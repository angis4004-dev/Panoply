import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPrices } from '@/lib/coingecko';

/**
 * GET /api/prices
 * Get current prices for specified coins with 24h change
 * Query params: ids (comma-separated string of coin ids)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');

    if (!idsParam) {
      return NextResponse.json({ error: 'Missing required parameter: ids' }, { status: 400 });
    }

    const coinIds = idsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (coinIds.length === 0) {
      return NextResponse.json({ error: 'No valid coin IDs provided' }, { status: 400 });
    }

    const prices = await getCurrentPrices(coinIds);
    return NextResponse.json(prices);
  } catch (error) {
    console.error('Error in /api/prices route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
