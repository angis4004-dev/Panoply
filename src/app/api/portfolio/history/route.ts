import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingBotModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { getMarketChart } from '@/lib/coingecko';
import { resolveBaseCoinId } from '@/lib/coin-symbols';
import { marketPnlSeries, type MarketPricePoint } from '@/lib/market-pnl-model';

/**
 * GET /api/portfolio/history?days=N&points=M
 *
 * This user's market-based strategy P&L across the requested window, sampled
 * at an even interval, for the dashboard's "Cumulative P&L" chart.
 *
 * Previously this read PortfolioSnapshot rows, which are written only when
 * someone loads the dashboard. The x-axis was therefore a record of when the
 * page had been open rather than a period of time - asking for a day and
 * getting four hours of it - and there was no value to report between two
 * snapshots hours apart.
 *
 * Each flow is replayed against the available historical prices for its base
 * and quote assets. This endpoint is intentionally separate from the income
 * and wallet-settlement calculations.
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

type PriceRow = [number, number];

function pairCoinIds(pair: string): [string, string] | null {
  const [base, quote] = pair.split('/');
  if (!base || !quote) return null;
  const baseId = resolveBaseCoinId(`${base}/USD`);
  const quoteId = resolveBaseCoinId(`${quote}/USD`);
  return baseId && quoteId ? [baseId, quoteId] : null;
}

function priceAt(rows: PriceRow[], timestamp: number, maxGapMs: number): number | null {
  if (rows.length === 0) return null;
  if (timestamp <= rows[0][0]) {
    return rows[0][0] - timestamp <= maxGapMs ? rows[0][1] : null;
  }
  if (timestamp >= rows[rows.length - 1][0]) {
    return timestamp - rows[rows.length - 1][0] <= maxGapMs ? rows[rows.length - 1][1] : null;
  }

  let low = 0;
  let high = rows.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle][0] <= timestamp) low = middle;
    else high = middle;
  }

  const before = rows[low];
  const after = rows[high];
  const gap = after[0] - before[0];
  if (gap <= 0 || gap > maxGapMs) return null;
  const fraction = (timestamp - before[0]) / gap;
  return before[1] + (after[1] - before[1]) * fraction;
}

/**
 * Resolution per window.
 *
 * A day gets a point every five minutes. Coarser sampling smoothed the
 * intra-hour texture away and left a line that ramped tidily between hourly
 * closes - the shape read as predictable because most of the detail was being
 * averaged out before it ever reached the client.
 */
function pointsFor(days: number): number {
  if (days <= 1) return 289; // 288 five-minute intervals across 24 hours
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

    const totals = new Array<number>(points).fill(0);
    let allocatedCapital = 0;
    let fundedFlows = 0;
    let unavailableFlows = 0;

    const coinIds = new Set<string>();
    for (const bot of bots) {
      if ((bot.allocatedAmount ?? 0) <= 0 || bot.type === 'Arbitrage') continue;
      const ids = pairCoinIds(bot.pair);
      if (ids) {
        coinIds.add(ids[0]);
        coinIds.add(ids[1]);
      }
    }

    const histories = new Map<string, PriceRow[]>();
    await Promise.all(
      [...coinIds].map(async (coinId) => {
        const chart = await getMarketChart(coinId, days);
        histories.set(coinId, chart.prices ?? []);
      })
    );

    const maxPriceGapMs = Math.max(step * 2, 10 * 60 * 1000);

    for (const bot of bots) {
      const allocated = bot.allocatedAmount ?? 0;
      if (allocated <= 0) continue;

      allocatedCapital += allocated;
      fundedFlows += 1;

      const ids = pairCoinIds(bot.pair);
      if (!ids || bot.type === 'Arbitrage') {
        unavailableFlows++;
        continue;
      }

      const baseHistory = histories.get(ids[0]) ?? [];
      const quoteHistory = histories.get(ids[1]) ?? [];
      const startAt = Math.max(from, new Date(bot.createdAt).getTime());
      const firstSample = sampleTimes.findIndex((time) => time >= startAt);
      if (firstSample < 0) continue;

      const timeline = [
        startAt,
        ...sampleTimes.slice(firstSample).filter((time) => time > startAt),
      ];
      const marketPrices: MarketPricePoint[] = [];
      let hasCompletePriceHistory = true;

      for (const timestamp of timeline) {
        const baseUsd = priceAt(baseHistory, timestamp, maxPriceGapMs);
        const quoteUsd = priceAt(quoteHistory, timestamp, maxPriceGapMs);
        if (baseUsd == null || quoteUsd == null) {
          hasCompletePriceHistory = false;
          break;
        }
        marketPrices.push({ timestamp, baseUsd, quoteUsd });
      }

      if (!hasCompletePriceHistory) {
        unavailableFlows++;
        continue;
      }

      const series = marketPnlSeries({
        strategy: bot.type,
        allocatedCapital: allocated,
        prices: marketPrices,
      });
      if (!series) {
        unavailableFlows++;
        continue;
      }

      const seriesOffset = startAt < sampleTimes[firstSample] ? 1 : 0;
      for (let chartIndex = firstSample; chartIndex < points; chartIndex++) {
        const seriesIndex = chartIndex - firstSample + seriesOffset;
        if (seriesIndex < series.length) totals[chartIndex] += series[seriesIndex];
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
      unavailableFlows,
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
