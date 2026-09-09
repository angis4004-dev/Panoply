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
import { LoadingState } from '@/components/ui/loader';
import { SETTLEMENT_INTERVAL_MS } from '@/lib/performance-model';

/*
 * Read off the model so the copy below cannot drift from what it does.
 *
 * Formatted rather than fixed to one unit: the interval has been six hours
 * and is now five minutes, and a label hardcoded to either reads as nonsense
 * the moment it changes ("every 0 hours").
 */
function settlementLabel(short: boolean): string {
  const minutes = Math.round(SETTLEMENT_INTERVAL_MS / 60_000);
  if (minutes < 60) return short ? `${minutes} min` : `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  if (short) return `${hours}h`;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

const SETTLEMENT_LABEL = settlementLabel(false);
const SETTLEMENT_LABEL_SHORT = settlementLabel(true);

interface ChartDataPoint {
  /** Epoch ms. The x-axis is a real time scale, not a category index. */
  ts: number;
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
    <div className="bg-ds-surface-inset border border-ds-border-strong rounded-xl p-3 shadow-2xl min-w-[150px]">
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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Tick spacings that land on times a person would name.
 *
 * Ticks used to be taken every Nth point, so their times came from wherever
 * the window happened to start: an axis reading 9:09 AM, 12:40 PM, 4:10 PM.
 * The gaps were even but the labels were arbitrary, which is why it looked
 * like an hour was missing between them. Choosing from this list and aligning
 * to local midnight gives 9:00, 12:00, 3:00 instead.
 */
const TICK_STEPS = [
  HOUR_MS,
  2 * HOUR_MS,
  3 * HOUR_MS,
  6 * HOUR_MS,
  12 * HOUR_MS,
  DAY_MS,
  2 * DAY_MS,
  5 * DAY_MS,
  7 * DAY_MS,
  14 * DAY_MS,
  30 * DAY_MS,
  60 * DAY_MS,
  90 * DAY_MS,
];

// Eight, so a day lands on a 3-hour step. Seven asked for 3.43h, which rounds
// up to 6h and leaves a sparse axis with only four labels across 24 hours.
function pickTickStep(spanMs: number, target = 8): number {
  const raw = spanMs / target;
  return TICK_STEPS.find((s) => s >= raw) ?? TICK_STEPS[TICK_STEPS.length - 1];
}

/** Tick times on round boundaries, aligned to local midnight. */
function alignedTicks(fromMs: number, toMs: number, step: number): number[] {
  const midnight = new Date(fromMs);
  midnight.setHours(0, 0, 0, 0);
  const base = midnight.getTime();

  const ticks: number[] = [];
  for (let t = base + Math.ceil((fromMs - base) / step) * step; t <= toMs; t += step) {
    ticks.push(t);
  }
  return ticks;
}

/** Label format follows the tick spacing, not the window length. */
function labelForStep(step: number) {
  if (step < DAY_MS) {
    return (ms: number) =>
      new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

/**
 * Current value, pinned to the right edge at the height of the last point.
 *
 * Recharts' built-in label cannot draw a filled pill behind its text, so this
 * renders the rect and text itself. Positioned from the viewBox rather than a
 * fixed offset so it stays attached to the line as the plot resizes.
 */
function CurrentValueBadge(props: {
  value?: number;
  color?: string;
  viewBox?: { x?: number; y?: number; width?: number };
}) {
  const { value = 0, color = '#00D4AA', viewBox } = props;
  if (!viewBox || viewBox.y == null || viewBox.x == null || viewBox.width == null) return null;

  const text = `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
  const width = Math.max(text.length * 6.4 + 10, 48);
  const height = 19;
  // Sits in the y-axis gutter, deliberately overlaying whichever value label
  // it lands on - the current figure matters more than a gridline number.
  const x = viewBox.x + viewBox.width + 2;
  const y = viewBox.y - height / 2;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={color} />
      <text
        x={x + width / 2}
        y={y + height / 2 + 4}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="#0A1420"
      >
        {text}
      </text>
    </g>
  );
}

function formatAxisDollar(v: number): string {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  // Sub-$10 ranges need a decimal or several gridlines collapse onto the same
  // label - a chart spanning $3.20 to $4.10 otherwise reads "$3, $4, $4".
  return abs < 10 && !Number.isInteger(v)
    ? `${sign}$${abs.toFixed(1)}`
    : `${sign}$${abs.toFixed(0)}`;
}

/**
 * Rounded, evenly-spaced y-axis ticks.
 *
 * Recharts picked its own from a padded domain and produced $3 / $6 / $12 -
 * evenly spaced down the axis but not evenly valued, so the gridlines implied
 * a scale the chart was not using. Choosing a round step and snapping the
 * domain to multiples of it means every gap is worth the same amount.
 *
 * The domain still fits the data rather than anchoring at zero: cumulative P&L
 * only grows, so a zero-anchored axis crushes real movement into a flat line
 * once the total is large. Zero is included whenever the series is near or
 * across it, which is exactly when "am I up?" is the question being asked.
 */
function niceScale(lo: number, hi: number, spansZero: boolean) {
  const low = spansZero ? Math.min(0, lo) : lo;
  const high = spansZero ? Math.max(0, hi) : hi;
  const range = high - low;

  if (range <= 0) {
    const step = Math.max(Math.abs(high) * 0.1, 1);
    return { domain: [low - step, high + step] as [number, number], ticks: [low, high] };
  }

  const target = 4;
  const raw = range / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const step =
    (normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 2.5
          ? 2.5
          : normalized <= 5
            ? 5
            : 10) * magnitude;

  const domainLo = Math.floor(low / step) * step;
  const domainHi = Math.ceil(high / step) * step;

  const ticks: number[] = [];
  for (let v = domainLo; v <= domainHi + step * 1e-6; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }

  return { domain: [domainLo, domainHi] as [number, number], ticks };
}

export default function PnLAreaChart() {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /*
   * A day, not a month.
   *
   * At a five-minute settlement the day view is the only one that shows the
   * texture of what a flow is actually doing; a month compresses those steps
   * into a line that barely leaves zero, and a flow younger than a few days
   * spends most of a 30d window as flat pre-creation nothing.
   */
  const [selectedRange, setSelectedRange] = useState('1d');
  /**
   * Capital the trader has committed, reported by the API alongside the series.
   *
   * Read rather than inferred. See the route's header: an all-zero series means
   * either "nothing allocated" or "allocated but not yet traded", and guessing
   * between them told traders with live positions that they had none.
   */
  const [allocatedCapital, setAllocatedCapital] = useState(0);

  useEffect(() => {
    let isMounted = true;
    // Falls back to the default range, not to a month - an unrecognised label
    // should fetch what the buttons show as selected, not something else.
    const days = RANGES.find((r) => r.label === selectedRange)?.days ?? 1;

    async function fetchHistory() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/portfolio/history?days=${days}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch portfolio history: ${response.status}`);
        }

        const body: {
          points: { timestamp: string; value: number }[];
          allocatedCapital?: number;
        } = await response.json();
        if (!isMounted) return;

        setAllocatedCapital(body.allocatedCapital ?? 0);

        // The series already spans the requested window at an even interval,
        // so there is nothing to bucket - each point is a value the portfolio
        // actually held at that moment.
        const processed: ChartDataPoint[] = (body.points ?? []).map((p) => {
          const ms = new Date(p.timestamp).getTime();
          return { ts: ms, fullLabel: fullLabel(ms, days), value: p.value };
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

    // Every 30 seconds, matching the engine's tick interval - a refetch now
    // always returns a moved line, because the series is computed rather than
    // read back from snapshots. The old 5-minute poll was pinned to the
    // snapshot write cadence, so for most of that window there was nothing new
    // to fetch and the chart sat visibly still.
    const interval = setInterval(fetchHistory, 30 * 1000);
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
  /**
   * Everything is coloured against where the window OPENED, not against zero.
   *
   * A market chart answers "up or down over this period", so the split has to
   * sit at the period's first value - which is also what the dashed baseline
   * marks. Colouring the whole series by its closing value instead painted a
   * day that finished down entirely red, including the hours it spent up.
   */
  const baseValue = data.length > 0 ? data[0].value : 0;
  const isPositive = latestValue >= baseValue;
  /*
   * Whether anything has actually been realized in this window.
   *
   * This used to be read as "has capital been allocated", on the reasoning that
   * a funded flow is never exactly flat at zero. True of the old simulated
   * walk; false of real trading, where a funded flow sits at exactly 0.00 until
   * its first position closes. Allocation is now answered by allocatedCapital,
   * and this answers only its own question.
   */
  const hasMovement = data.length >= 2 && data.some((d) => d.value !== 0);
  const hasCapital = allocatedCapital > 0;
  // Movement across the selected window, not since inception - the caption
  // says "Last 24 hours", so the figure beside it has to mean the same thing.
  const windowChange = data.length > 0 ? latestValue - data[0].value : 0;
  // Literals because Recharts writes these straight into SVG stroke/stopColor
  // attributes, which cannot read a CSS custom property. They must be kept in
  // step with --ds-value-positive / --ds-value-negative in styles/tailwind.css;
  // the negative one here was still the pre-fix #E5555A, which measured
  // 4.49:1 on this card and failed AA.
  const POSITIVE = '#00D4AA';
  const NEGATIVE = '#E85D62';
  const lineColor = isPositive ? POSITIVE : NEGATIVE;

  // Ticks come from the clock, not from the array. See pickTickStep.
  const firstTs = data.length ? data[0].ts : 0;
  const lastTs = data.length ? data[data.length - 1].ts : 0;
  const tickStep = pickTickStep(Math.max(lastTs - firstTs, 1));
  const xTicks = data.length ? alignedTicks(firstTs, lastTs, tickStep) : [];
  const formatTick = labelForStep(tickStep);

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
  const spansZero = lo <= 0 && hi >= 0;

  const { domain: yDomain, ticks: yTicks } = niceScale(lo, hi, spansZero);
  const includeZero = yDomain[0] <= 0 && yDomain[1] >= 0;

  // Fraction of the plot height at which the opening value sits, used as the
  // hard stop in both gradients so stroke and fill change colour on the same
  // line rather than a pixel apart. Measured against the rendered domain, not
  // the data range, or the split lands off the line once the axis is padded.
  const splitOffset =
    yDomain[1] === yDomain[0]
      ? 0.5
      : Math.max(0, Math.min(1, (yDomain[1] - baseValue) / (yDomain[1] - yDomain[0])));

  return (
    <div className="bg-ds-surface-raised border border-ds-border rounded-2xl p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ds-text">Cumulative P&L</h3>
            {hasMovement && (
              <span className="inline-flex items-center gap-1.5 text-ds-caption text-ds-text-muted">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-ds-value-positive motion-safe:animate-pulse"
                  aria-hidden
                />
                Live
              </span>
            )}
          </div>
          {hasMovement && (
            <div className="flex items-baseline gap-2 mt-1">
              {/* The headline figure the card was missing. Without it the chart
                  showed a shape but never stated where the portfolio actually
                  stands, and nothing on the card visibly changed on a refetch. */}
              <span
                className={`text-2xl font-bold font-mono tabular-nums ${isPositive ? 'text-ds-value-positive' : 'text-ds-value-negative'}`}
              >
                {latestValue >= 0 ? '+' : '-'}$
                {Math.abs(latestValue).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              <span
                className={`text-ds-caption font-medium tabular-nums ${windowChange >= 0 ? 'text-ds-value-positive' : 'text-ds-value-negative'}`}
              >
                {windowChange >= 0 ? '▲' : '▼'} $
                {Math.abs(windowChange).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          )}
          {/* The settlement cadence is the chart's real resolution: no point
              between two settlements carries new information, so a reader who
              does not know it will read a step as a stall. */}
          <p className="text-ds-caption text-ds-text-secondary mt-0.5">
            {rangeDescription[selectedRange]} · signal flows · modelled, settles every{' '}
            {SETTLEMENT_LABEL_SHORT}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          {RANGES.map((r) => (
            <button
              key={`range-${r.label}`}
              type="button"
              onClick={() => setSelectedRange(r.label)}
              aria-pressed={selectedRange === r.label}
              className={`text-ds-caption inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-ds-sm px-2.5 font-medium transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised ${
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
        <div className="mb-3 p-3 bg-ds-value-negative/10 border border-ds-value-negative/30 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading && data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center">
          <LoadingState message="Loading chart data" size={36} />
        </div>
      ) : !error && !hasMovement ? (
        /*
         * Two different empty states, because they mean opposite things to the
         * reader. Telling someone with $5,200 committed that they have "no
         * capital allocated" reads as their money having gone missing.
         *
         * A flat line along zero is not drawn in either case: it would look
         * like a measured result rather than an absence of one.
         */
        <div className="flex flex-col items-center justify-center h-[220px] text-center px-6">
          {hasCapital ? (
            <>
              <p className="text-sm text-ds-text-secondary">No P&amp;L yet</p>
              <p className="text-ds-caption text-ds-text-muted mt-1.5">
                <span className="tabular-nums">
                  $
                  {allocatedCapital.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>{' '}
                is allocated. Results settle once every {SETTLEMENT_LABEL}, so a flow reads exactly
                zero until its first one lands — for a flow started just now, that is about{' '}
                {SETTLEMENT_LABEL} away.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-ds-text-secondary">No capital allocated yet</p>
              <p className="text-ds-caption text-ds-text-muted mt-1.5">
                Start a signal flow and this chart tracks its P&amp;L across the whole period.
              </p>
            </>
          )}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          {/* right:5 clipped the final x-axis label - the last tick rendered as
              "4:24" with its AM sheared off at the plot edge. The margin now
              leaves room for a full timestamp. */}
          {/* left:8 keeps the first time label off the card edge; the y-axis
              reserves its own width on the right, and bottom:4 stops the time
              row from sitting flush against the plot. */}
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: 8 }}>
            <defs>
              {/* Fill fades toward the opening line from both directions, so
                  the shaded area reads as distance travelled from the open. */}
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor={POSITIVE} stopOpacity={0.3} />
                <stop offset={splitOffset} stopColor={POSITIVE} stopOpacity={0.03} />
                <stop offset={splitOffset} stopColor={NEGATIVE} stopOpacity={0.03} />
                <stop offset={1} stopColor={NEGATIVE} stopOpacity={0.3} />
              </linearGradient>
              {/* Two stops at the same offset give a hard colour change rather
                  than a blend, so the stroke flips exactly at the open. */}
              <linearGradient id="pnlStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={splitOffset} stopColor={POSITIVE} />
                <stop offset={splitOffset} stopColor={NEGATIVE} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={xTicks}
              tickFormatter={formatTick}
              tick={{ fill: '#A1A1AA', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
              tickMargin={10}
            />
            {/* Right-hand axis, as on the price charts this mirrors. On the
                left, the bottom value label sat directly above the first time
                label - "$0" with "9:36 AM" stacked under it - because the axis
                column and the first tick share that corner. */}
            <YAxis
              orientation="right"
              tick={{ fill: '#A1A1AA', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatAxisDollar}
              width={56}
              domain={yDomain}
              ticks={yTicks}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* Only drawn when zero is actually inside the fitted range -
                otherwise Recharts clamps it to an edge, where a dashed line
                labelled nothing reads as a boundary of the data. */}
            {includeZero && (
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
            )}
            {/* The opening value, which every colour on the chart is measured
                against. Without it the red/green split looks arbitrary. */}
            <ReferenceLine
              y={baseValue}
              stroke={isPositive ? 'rgba(0,212,170,0.45)' : 'rgba(232,93,98,0.45)'}
              strokeDasharray="2 3"
            />
            <ReferenceLine
              y={latestValue}
              stroke="transparent"
              label={<CurrentValueBadge value={latestValue} color={lineColor} />}
            />
            <Area
              /*
               * Monotone, for a curve rather than a sawtooth.
               *
               * At a five-minute settlement a day holds 288 outcomes, and
               * drawing them with straight segments turned every one of them
               * into a visible corner - accurate, but unreadable as a trend.
               *
               * Monotone is the honest way to soften that: it interpolates
               * through every data point exactly and cannot overshoot, so no
               * plotted value is invented and no peak or trough is moved. It
               * curves the path between points, nothing else. The underlying
               * series is untouched - the tooltip still reports the real
               * value at every point.
               */
              type="monotone"
              dataKey="value"
              stroke="url(#pnlStroke)"
              strokeWidth={1.75}
              // Fill down to the opening value, not to the axis floor. Filling
              // to the floor drew a solid slab across the whole width wherever
              // the axis dipped below the open, including under stretches
              // where the line was up.
              baseValue={baseValue}
              fill="url(#pnlGradient)"
              isAnimationActive={false}
              // No per-point dots: at ~288 points they merge into a band and
              // bury the line. The badge marks the current value instead.
              dot={false}
              activeDot={{ r: 3.5, fill: lineColor, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
