import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingBotModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { modelledPnlSeries } from '@/lib/performance-model';

/**
 * GET /api/portfolio/history?days=N&points=M
 *
 * This user's modelled P&L across the requested window, sampled at an even
 * interval, for the dashboard's "Cumulative P&L" chart.
 *
 * Previously this read PortfolioSnapshot rows, which are written only when
 * someone loads the dashboard. The x-axis was therefore a record of when the
 * page had been open rather than a period of time - asking for a day and
 * getting four hours of it - and there was no value to report between two
 * snapshots hours apart.
 *
 * The series is computed from the deterministic performance model instead
 * (see modelledPnlSeries), a pure function of flow id, allocated capital, and
 * creation time - so the same flows always produce the same series, and an
 * aggregate computed elsewhere from those flows never disagrees with this
 * chart.
 *
 * ## Why allocatedCapital is returned alongside the series
 *
 * An all-zero series has two completely different causes: no capital
 * committed, or capital committed to a flow whose first interval has not
 * completed yet - the model holds a flow at zero until then. The numbers
 * alone cannot tell those apart, so the chart is given allocatedCapital
 * rather than left to guess from the shape of the series.
 */

const MAX_POINTS = 400;

/**
 * Resolution per window.
 *
 * A day gets a point every five minutes. Coarser sampling smoothed the
 * intra-hour texture away and left a line that ramped tidily between hourly
 * closes - the shape read as predictable because most of the detail was being
 * averaged out before it ever reached the client.
 */
function pointsFor(days: number): number {
  if (days <= 1) return 288; // every 5 minutes
  if (days <= 7) return 336; // every 30 minutes
  if (days <= 30) return 240;
  return 180;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const locked = requireUnlock(request, session);
    if (locked) return locked;

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days');
    const days = daysParam ? Number(daysParam) : 30;
    if (!Number.isFinite(days) || days <= 0) {
      return NextResponse.json({ error: 'days must be a positive number' }, { status: 400 });
    }

    const pointsParam = searchParams.get('points');
    const fallback = pointsFor(days);
    const requestedPoints = pointsParam ? Number(pointsParam) : fallback;
    const points = Math.min(
      Math.max(Number.isFinite(requestedPoints) ? Math.floor(requestedPoints) : fallback, 2),
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

    /*
     * Built from the deterministic performance model - see modelledPnlSeries.
     * Each flow's curve is a pure function of its id, allocated capital, and
     * creation time, so replaying the same flows at the same sample times
     * always folds into the same total.
     */
    const totals = new Array<number>(points).fill(0);
    let allocatedCapital = 0;
    let fundedFlows = 0;

    for (const bot of bots) {
      const allocated = bot.allocatedAmount ?? 0;
      // A flow with no capital contributes nothing to either figure, which is
      // why an admin-created flow does not move this line.
      if (allocated <= 0) continue;

      allocatedCapital += allocated;
      fundedFlows += 1;

      const series = modelledPnlSeries({
        flowId: String(bot._id),
        allocatedCapital: allocated,
        createdAt: bot.createdAt,
        sampleTimes,
      });

      for (let i = 0; i < points; i++) {
        totals[i] += series[i];
      }
    }

    return NextResponse.json({
      from: new Date(from).toISOString(),
      to: new Date(now).toISOString(),
      // What the trader has committed. Lets the client distinguish "nothing
      // allocated" from "allocated but nothing realized yet" without inferring
      // it from the shape of the series.
      allocatedCapital: Number(allocatedCapital.toFixed(2)),
      fundedFlows,
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
