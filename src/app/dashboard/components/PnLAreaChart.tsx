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
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '6m', days: 180 },
  { label: '1y', days: 365 },
];

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

        // Snapshots land roughly every 5 minutes, so day-level bucketing
        // (grouping every point from the same calendar day into one) works
        // for the long ranges but is exactly wrong for 7d/14d: on the very
        // day someone activates this feature, every snapshot so far shares
        // today's date and would collapse into a single point, hiding the
        // one thing 30s ticks actually produce - intraday movement. Short
        // ranges bucket by hour instead so a few hours of real activity
        // still draws a real line.
        const bucketByHour = days <= 14;
        const buckets = new Map<string, { timestampMs: number; value: number }>();
        for (const s of snapshots) {
          const ts = new Date(s.timestamp).getTime();
          const key = bucketByHour
            ? new Date(ts).toISOString().slice(0, 13) // YYYY-MM-DDTHH
            : new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
          buckets.set(key, { timestampMs: ts, value: s.value });
        }
        const processed: ChartDataPoint[] = Array.from(buckets.values())
          .sort((a, b) => a.timestampMs - b.timestampMs)
          .map(({ timestampMs, value }) => ({
            date: bucketByHour
              ? new Date(timestampMs).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : new Date(timestampMs).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                }),
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
    '7d': 'Last 7 days',
    '14d': 'Last 14 days',
    '30d': 'Last 30 days',
    '6m': 'Last 6 months',
    '1y': 'Last 1 year',
  };

  const latestValue = data.length > 0 ? data[data.length - 1].value : 0;
  const isPositive = latestValue >= 0;
  const lineColor = isPositive ? '#00D4AA' : '#E5555A';

  // Aim for ~7 visible x-axis labels regardless of how many days are loaded.
  const xAxisInterval = Math.max(0, Math.ceil(data.length / 7) - 1);

  return (
    <div className="bg-[#122131] border border-[#212A35] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Cumulative P&L</h3>
          <p className="text-ds-caption text-ds-text-secondary mt-0.5">
            {rangeDescription[selectedRange]} · signal flows
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={`range-${r.label}`}
              type="button"
              onClick={() => setSelectedRange(r.label)}
              aria-pressed={selectedRange === r.label}
              className={`text-ds-caption inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-ds-sm px-2.5 font-medium transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#122131] ${
                selectedRange === r.label
                  ? 'bg-teal-500/15 text-teal-400'
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
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
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
            />
            <YAxis
              tick={{ fill: '#A1A1AA', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatAxisDollar}
              width={48}
            />
            <Tooltip content={<CustomTooltip positive={isPositive} />} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
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
