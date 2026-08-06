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
  /** Axis label. */
  date: string;
  /** Full timestamp for the tooltip, so a reading is never ambiguous. */
  fullLabel: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number; payload: ChartDataPoint }[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0]?.value ?? 0;
  const point = payload[0]?.payload;
  const sign = value >= 0 ? '+' : '';
  // Coloured by the value under the cursor, not by where the series ends. The
  // previous version passed one flag for the whole chart, so every reading in
  // a day that closed down was red even where the portfolio was up.
  const positive = value >= 0;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 shadow-2xl min-w-[150px]">
      <p className="text-ds-caption text-ds-text-secondary font-semibold mb-2">
        {point?.fullLabel ?? ''}
      </p>
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

/**
 * Axis label format, chosen from the window that was REQUESTED.
 *
 * This used to key off the span the returned data happened to cover, which was
 * the wrong input: the series now always fills the whole requested window, and
 * even before that, letting the data decide meant selecting "1d" and getting
 * an axis reading 3:37am to 7:03am - the hours a dashboard had been open, not
 * a day.
 */
function labelFormat(days: number) {
  if (days <= 1) {
    // Within a day a bare clock time is unambiguous.
    return (ms: number) =>
      new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (days <= 14) {
    // Past a day it is not: "3 AM" on a 7d axis could be any of seven mornings.
    return (ms: number) =>
      new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
  }
  return (ms: number) =>
    new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Always unambiguous - the tooltip has room for a date and a time. */
function fullLabel(ms: number, days: number): string {
  const d = new Date(ms);
  if (days <= 1) {
    return d.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

        const body: { points: { timestamp: string; value: number }[] } = await response.json();
        if (!isMounted) return;

        // The series already spans the requested window at an even interval,
        // so there is nothing to bucket - each point is a value the portfolio
        // actually held at that moment.
        const toLabel = labelFormat(days);
        const processed: ChartDataPoint[] = (body.points ?? []).map((p) => {
          const ms = new Date(p.timestamp).getTime();
          return { date: toLabel(ms), fullLabel: fullLabel(ms, days), value: p.value };
        });

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
  // A flow with capital in it is never exactly flat at zero across a window,
  // so this separates "nothing allocated" from "allocated and currently even".
  const hasMovement = data.length >= 2 && data.some((d) => d.value !== 0);
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
      ) : !error && !hasMovement ? (
        // The series always covers the requested window now, so an empty chart
        // means there is genuinely nothing allocated rather than nothing
        // recorded. Drawing a flat line along zero would look like a result.
        <div className="flex flex-col items-center justify-center h-[220px] text-center px-6">
          <p className="text-sm text-ds-text-secondary">No capital allocated yet</p>
          <p className="text-ds-caption text-ds-text-muted mt-1.5">
            Start a signal flow and this chart tracks its P&L across the whole period.
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
            <Tooltip content={<CustomTooltip />} />
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
