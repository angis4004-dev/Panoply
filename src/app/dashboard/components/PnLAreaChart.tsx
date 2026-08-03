'use client';

import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface ChartDataPoint {
  date: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
  positive: boolean;
}

function CustomTooltip({ active, payload, label, positive }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0]?.value ?? 0;
  const sign = value >= 0 ? '+' : '';
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 shadow-2xl min-w-[140px]">
      <p className="text-ds-caption text-ds-text-secondary font-semibold mb-2">{label}</p>
      <p
        className={`text-sm font-bold font-mono tabular-nums ${positive ? 'text-ds-value-positive' : 'text-ds-value-negative'}`}
      >
        {sign}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </p>
      <p className="text-ds-caption text-ds-text-secondary mt-0.5">Signal Flow P&L</p>
    </div>
  );
}

const RANGES: { label: string; days: number }[] = [
  { label: '1d', days: 1 },
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '6m', days: 180 },
  { label: '1y', days: 365 },
];

type Granularity = 'fine' | 'time' | 'datetime' | 'date';

/**
 * Bucket width in minutes for each granularity.
 *
 * Everything under 36h used to bucket by the hour, which quietly destroyed
 * short ranges: 46 minutes of snapshots produced zero complete hourly buckets,
 * so the chart drew a straight line between two endpoints. Not a rendering
 * bug - there was genuinely nothing between them to draw. At 5-minute
 * resolution the same 46 minutes yields 9 points, 38% of which step down.
 *
 * Snapshots are written every 5 minutes, so 5 is the floor: asking for finer
 * buckets cannot invent detail that was never recorded.
 */
const BUCKET_MINUTES: Record<Granularity, number> = {
  fine: 5,
  time: 15,
  datetime: 60,
  date: 60 * 24,
};

/**
 * Bucket size and label format are chosen from the span the data actually
 * covers, not from the range the user asked for.
 *
 * Those differ constantly here. Snapshots are written every ~5 minutes with no
 * backfill, so a young account holds only a few hours of history; asking for
 * 30d still returns just those hours. Keying off the requested window meant a
 * few hours of data got bucketed per-day, collapsed into a single point, and
 * tripped the "not enough history" state - so 7d drew a full chart while 30d
 * claimed there was nothing to show. Measuring the real span keeps every range
 * rendering the same underlying history, which is the honest result when the
 * wider window genuinely contains no extra data.
 */
function pickGranularity(spanMs: number): Granularity {
  const HOUR = 60 * 60 * 1000;
  // A few hours of history needs 5-minute detail or it renders as a couple of
  // points joined by a straight line - which is what a brand-new account has,
  // and therefore the first thing anyone sees.
  if (spanMs <= 3 * HOUR) return 'fine';
  // Inside a single day a bare clock time is unambiguous. Quarter-hour buckets
  // give a full day ~96 points instead of 24.
  if (spanMs <= 36 * HOUR) return 'time';
  // Past a day it is not: "3:17 AM" on the old 7d axis could have been any of
  // seven mornings. Multi-day hourly buckets must carry their date.
  if (spanMs <= 14 * 24 * HOUR) return 'datetime';
  return 'date';
}

function formatBucketLabel(ms: number, g: Granularity): string {
  const d = new Date(ms);
  if (g === 'fine' || g === 'time')
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (g === 'datetime')
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Bucket key in LOCAL time. The previous key came from toISOString(), i.e.
 * UTC, while every label was rendered with toLocale* - so for anyone not on
 * UTC the day boundaries in the data disagreed with the dates on the axis, and
 * snapshots either side of local midnight landed in the wrong bucket.
 *
 * Keyed off minutes-since-local-midnight divided by the bucket width, so the
 * same function handles 5-minute and day-long buckets without special cases.
 */
function bucketKey(ms: number, g: Granularity): string {
  const d = new Date(ms);
  const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (g === 'date') return day;
  const minutesIntoDay = d.getHours() * 60 + d.getMinutes();
  return `${day}-${Math.floor(minutesIntoDay / BUCKET_MINUTES[g])}`;
}

function formatAxisDollar(v: number): string {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(1)}k` : `${sign}$${abs.toFixed(0)}`;
}

export default function PnLAreaChart() {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState('30d');

  useEffect(() => {
    let isMounted = true;
    const days = RANGES.find((r) => r.label === selectedRange)?.days ?? 30;

    async function fetchHistory() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/portfolio/history?days=${days}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch portfolio history: ${response.status}`);
        }

        const snapshots: { timestamp: string; value: number }[] = await response.json();
        if (!isMounted) return;

        if (snapshots.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }

        // Granularity follows the data, not the request - see pickGranularity.
        const times = snapshots.map((s) => new Date(s.timestamp).getTime());
        const span = Math.max(...times) - Math.min(...times);
        const granularity = pickGranularity(span);

        const buckets = new Map<string, { timestampMs: number; value: number }>();
        for (const s of snapshots) {
          const ts = new Date(s.timestamp).getTime();
          // Last snapshot in a bucket wins: the closing value for that hour or
          // day is what a cumulative P&L line should step to.
          buckets.set(bucketKey(ts, granularity), { timestampMs: ts, value: s.value });
        }

        const processed: ChartDataPoint[] = Array.from(buckets.values())
          .sort((a, b) => a.timestampMs - b.timestampMs)
          .map(({ timestampMs, value }) => ({
            date: formatBucketLabel(timestampMs, granularity),
            value,
          }));

        setData(processed);
        setLoading(false);
      } catch (err) {
        if (isMounted) {
          setError('Failed to load portfolio history.');
          setData([]);
          setLoading(false);
          console.error('Error fetching portfolio history:', err);
        }
      }
    }

    fetchHistory();

    // Matches the snapshot write cadence in lib/portfolio-snapshot.ts, so a
    // refetch is likely to actually pick up a new point.
    const interval = setInterval(fetchHistory, 5 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedRange]);

  const rangeDescription: Record<string, string> = {
    '1d': 'Last 24 hours',
    '7d': 'Last 7 days',
    '14d': 'Last 14 days',
    '30d': 'Last 30 days',
    '6m': 'Last 6 months',
    '1y': 'Last 1 year',
  };

  const latestValue = data.length > 0 ? data[data.length - 1].value : 0;
  const isPositive = latestValue >= 0;
  // Literals because Recharts writes these straight into SVG stroke/stopColor
  // attributes, which cannot read a CSS custom property. They must be kept in
  // step with --ds-value-positive / --ds-value-negative in styles/tailwind.css;
  // the negative one here was still the pre-fix #E5555A, which measured
  // 4.49:1 on this card and failed AA.
  const lineColor = isPositive ? '#00D4AA' : '#E85D62';

  // Target fewer ticks when each label carries a date as well as an hour
  // ("Aug 1, 3 PM" is roughly twice the width of "3:17 PM"), and let Recharts
  // drop any that would still collide via minTickGap below.
  const longLabels = data.some((d) => d.date.includes(','));
  const targetTicks = longLabels ? 5 : 7;
  const xAxisInterval = Math.max(0, Math.ceil(data.length / targetTicks) - 1);

  /**
   * Fit the y-axis to the data instead of anchoring it at zero.
   *
   * Recharts' YAxis defaults to domain [0, 'auto']. That is fine on day one,
   * but cumulative P&L only grows, so the interesting movement becomes a
   * smaller and smaller fraction of the plotted height: once a portfolio sits
   * at +$750, a genuine $6 drawdown is under 1% of the chart and reads as a
   * flat line. Measured on simulated data, the deepest weekly dip occupied
   * 0.8% of the chart zero-anchored versus 32% fitted - the dips were being
   * drawn, just crushed. It also reclaims the empty lower half of the card.
   *
   * Zero stays meaningful: the padded range is extended to include it whenever
   * the series is near or across it, so "am I actually up?" is still readable
   * exactly when that question matters.
   */
  const values = data.map((d) => d.value);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  const pad = Math.max((hi - lo) * 0.15, 1);
  const spansZero = lo <= 0 && hi >= 0;
  // Within a pad of zero, snap to it rather than floating just above.
  const includeZero = spansZero || lo - pad <= 0;
  const yDomain: [number, number] = [includeZero ? Math.min(0, lo - pad) : lo - pad, hi + pad];

  return (
    <div className="bg-[#122131] border border-[#212A35] rounded-2xl p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Cumulative P&L</h3>
          <p className="text-ds-caption text-ds-text-secondary mt-0.5">
            {rangeDescription[selectedRange]} · signal flows
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          {RANGES.map((r) => (
            <button
              key={`range-${r.label}`}
              type="button"
              onClick={() => setSelectedRange(r.label)}
              aria-pressed={selectedRange === r.label}
              className={`text-ds-caption inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-ds-sm px-2.5 font-medium transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#122131] ${
                selectedRange === r.label
                  ? 'bg-primary/15 text-primary'
                  : 'text-ds-text-secondary hover:text-ds-text'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-900/50 border border-red-800 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading && data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[220px]">
          <p className="text-ds-text-secondary">Loading chart data...</p>
        </div>
      ) : !error && data.length < 2 ? (
        // Snapshots only exist once a signal flow has actually run for a
        // while - a brand-new account has nothing to plot yet. Showing a
        // flat fabricated line here would misrepresent history that never
        // happened, so this is an honest empty state instead.
        <div className="flex flex-col items-center justify-center h-[220px] text-center px-6">
          <p className="text-sm text-ds-text-secondary">Not enough history yet</p>
          <p className="text-ds-caption text-ds-text-muted mt-1.5">
            Keep a signal flow running and this chart fills in as real P&L accrues.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          {/* right:5 clipped the final x-axis label - the last tick rendered as
              "4:24" with its AM sheared off at the plot edge. The margin now
              leaves room for a full timestamp. */}
          <AreaChart data={data} margin={{ top: 5, right: 28, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#A1A1AA', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              interval={xAxisInterval}
              minTickGap={24}
            />
            <YAxis
              tick={{ fill: '#A1A1AA', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatAxisDollar}
              width={48}
              domain={yDomain}
            />
            <Tooltip content={<CustomTooltip positive={isPositive} />} />
            {/* Only drawn when zero is actually inside the fitted range -
                otherwise Recharts clamps it to an edge, where a dashed line
                labelled nothing reads as a boundary of the data. */}
            {includeZero && (
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              fill="url(#pnlGradient)"
              dot={false}
              activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
