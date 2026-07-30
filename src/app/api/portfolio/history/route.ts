import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { PortfolioSnapshotModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';

/**
 * GET /api/portfolio/history?days=N
 *
 * Returns this user's real dry-run P&L history for the dashboard's
 * "Cumulative P&L" chart. Points come from PortfolioSnapshot rows written
 * opportunistically by GET /api/bots (see lib/portfolio-snapshot.ts) - there
 * is no backfill, so an account with little activity will simply have few
 * points rather than a fabricated backstory.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : 30;
    if (!Number.isFinite(days) || days <= 0) {
      return NextResponse.json({ error: 'days must be a positive number' }, { status: 400 });
    }

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const snapshots = await PortfolioSnapshotModel.find({
      userId: session.user.id,
      timestamp: { $gte: since },
    })
      .sort({ timestamp: 1 })
      .select('timestamp totalPnlDollar')
      .lean();

    return NextResponse.json(
      snapshots.map((s) => ({
        timestamp: s.timestamp.toISOString(),
        value: s.totalPnlDollar,
      }))
    );
  } catch (error) {
    console.error('Error fetching portfolio history:', error);
    return NextResponse.json({ error: 'Failed to fetch portfolio history' }, { status: 500 });
  }
}
