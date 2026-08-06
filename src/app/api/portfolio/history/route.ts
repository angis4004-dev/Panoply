import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingBotModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { pnlPercentSeries, type ProjectableBot } from '@/lib/bot-pnl';

/**
 * GET /api/portfolio/history?days=N&points=M
 *
 * Returns this user's dry-run P&L across the full requested window, sampled at
 * an even interval, for the dashboard's "Cumulative P&L" chart.
 *
 * Previously this read PortfolioSnapshot rows, which are written only when
 * someone loads the dashboard. The x-axis was therefore a record of when the
 * page had been open rather than a period of time - asking for a day and
 * getting four hours of it - and there was no value to report between two
 * snapshots hours apart.
 *
 * The tick engine is deterministic, so each flow's value at any past moment is
 * recomputed instead (see pnlPercentSeries). Every point on the axis is a real
 * value the portfolio actually held, and the series always ends on the same
 * figure the rest of the dashboard shows.
 */

// Enough resolution that hourly market regimes are visible on a one-day view
// without sending a point per tick. 145 points over 24h is one every 10
// minutes; over a year it is roughly one every 2.5 days.
const DEFAULT_POINTS = 145;
const MAX_POINTS = 400;

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days');
    const days = daysParam ? Number(daysParam) : 30;
    if (!Number.isFinite(days) || days <= 0) {
      return NextResponse.json({ error: 'days must be a positive number' }, { status: 400 });
    }

    const pointsParam = searchParams.get('points');
    const requestedPoints = pointsParam ? Number(pointsParam) : DEFAULT_POINTS;
    const points = Math.min(
      Math.max(Number.isFinite(requestedPoints) ? Math.floor(requestedPoints) : DEFAULT_POINTS, 2),
      MAX_POINTS
    );

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const bots = await TradingBotModel.find({ userId: session.user.id }).lean();

    const now = Date.now();
    const windowMs = days * 24 * 60 * 60 * 1000;
    const from = now - windowMs;
    const step = windowMs / (points - 1);
    const sampleTimes = Array.from({ length: points }, (_, i) =>
      i === points - 1 ? now : Math.round(from + i * step)
    );

    // Dollar P&L per flow, summed. A flow with no allocated capital
    // contributes nothing, which is why an admin-created flow does not move
    // this line.
    const totals = new Array<number>(points).fill(0);
    for (const bot of bots) {
      const allocated = bot.allocatedAmount ?? 0;
      if (allocated <= 0) continue;

      const projectable: ProjectableBot = {
        id: bot._id.toString(),
        status: bot.status,
        confidence: bot.confidence,
        simulatedPnlPercent: bot.simulatedPnlPercent ?? 0,
        lastTickAt: bot.lastTickAt ?? bot.createdAt,
        createdAt: bot.createdAt,
      };

      const series = pnlPercentSeries(projectable, sampleTimes);
      for (let i = 0; i < points; i++) {
        totals[i] += (allocated * series[i]) / 100;
      }
    }

    return NextResponse.json({
      from: new Date(from).toISOString(),
      to: new Date(now).toISOString(),
      points: sampleTimes.map((t, i) => ({
        timestamp: new Date(t).toISOString(),
        value: Number(totals[i].toFixed(2)),
      })),
    });
  } catch (error) {
    console.error('Error fetching portfolio history:', error);
    return NextResponse.json({ error: 'Failed to fetch portfolio history' }, { status: 500 });
  }
}
