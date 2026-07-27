import { NextRequest, NextResponse } from 'next/server';
import { getMarketChart } from '@/lib/coingecko';

/**
 * GET /api/prices/chart
 * Get market chart data for a specific coin
 * Query params: id (coin id), days (number of days)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const daysParam = searchParams.get('days');

    if (!id) {
      return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 });
    }

    if (!daysParam) {
      return NextResponse.json({ error: 'Missing required parameter: days' }, { status: 400 });
    }

    const days = parseInt(daysParam, 10);
    if (isNaN(days) || days <= 0) {
      return NextResponse.json({ error: 'Days must be a positive number' }, { status: 400 });
    }

    const chartData = await getMarketChart(id, days);
    return NextResponse.json(chartData);
  } catch (error) {
    console.error('Error in /api/prices/chart route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
