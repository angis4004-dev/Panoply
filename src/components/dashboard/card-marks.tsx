/**
 * Small drawings the Overview's cards use to show a figure as well as state it.
 *
 * Each one draws a number the card already has - nothing here is decoration.
 * They are presentational and take plain values, so a card decides what to
 * feed them and these only decide how it looks.
 *
 * Motion is one rule for all of them: when a value changes, the mark moves to
 * it over 400ms on an ease-out, so the direction of a change is visible. A
 * poll that returns the same value changes nothing, so nothing moves. Under
 * prefers-reduced-motion the mark jumps straight to its value.
 */

const MOVE =
  'transition-[width,flex-grow,stroke-dasharray,left] duration-[400ms] ease-ds-out motion-reduce:transition-none';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export interface SplitSegment {
  label: string;
  value: number;
  /** Displayed beside the label, already formatted. */
  display: string;
  tone: 'full' | 'mid' | 'low';
}

const TONE: Record<SplitSegment['tone'], string> = {
  full: 'bg-primary',
  mid: 'bg-primary/55',
  low: 'bg-primary/25',
};

/**
 * One bar in parts, with its legend. Used for where a trader's money sits:
 * wallet, flows, vaults. An empty account draws a plain track rather than
 * three zero-width slivers.
 */
export function SplitBar({ segments, label }: { segments: SplitSegment[]; label: string }) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  return (
    <div className="grid gap-2.5">
      <div role="img" aria-label={label} className="flex h-2 gap-[3px]">
        {total > 0 ? (
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span
                key={s.label}
                className={`block min-w-[6px] rounded-full ${TONE[s.tone]} ${MOVE}`}
                style={{ flexGrow: s.value, flexBasis: 0 }}
              />
            ))
        ) : (
          <span className="block flex-1 rounded-full bg-white/[0.06]" />
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ds-text-secondary">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 rounded-full ${TONE[s.tone]}`} />
            {s.label}
            <span className="font-mono font-medium tabular-nums text-ds-text">{s.display}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * One dot per flow, filled when that flow is in profit. Past `max` the rest
 * collapse into a count, so a trader with forty flows gets a row, not a wall.
 */
export function FlowDots({ flags, max = 12 }: { flags: boolean[]; max?: number }) {
  const shown = flags.slice(0, max);
  const rest = flags.length - shown.length;
  const inProfit = flags.filter(Boolean).length;
  return (
    <div
      role="img"
      aria-label={
        flags.length === 0 ? 'No flows yet' : `${inProfit} of ${flags.length} flows in profit`
      }
      className="flex flex-wrap items-center gap-2"
    >
      {flags.length === 0 ? (
        <span className="h-4 w-4 rounded-full border-[1.5px] border-dashed border-ds-text-muted" />
      ) : (
        shown.map((on, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-[1.5px] transition-colors duration-[400ms] ease-ds-out motion-reduce:transition-none ${
              on
                ? 'border-primary bg-primary shadow-[0_0_12px_rgba(255,240,201,0.35)]'
                : 'border-ds-text-muted bg-transparent'
            }`}
          />
        ))
      )}
      {rest > 0 && (
        <span className="font-mono text-xs tabular-nums text-ds-text-muted">+{rest}</span>
      )}
    </div>
  );
}

/** A half-circle gauge, 0 to 100. */
export function Gauge({ value, className = '' }: { value: number; className?: string }) {
  const v = clampPercent(value);
  return (
    <svg viewBox="0 0 120 66" className={className} aria-hidden>
      <path
        d="M10 60A50 50 0 0 1 110 60"
        pathLength={100}
        fill="none"
        stroke="rgb(var(--ds-border-subtle-rgb))"
        strokeWidth={9}
        strokeLinecap="round"
      />
      {v > 0 && (
        <path
          d="M10 60A50 50 0 0 1 110 60"
          pathLength={100}
          fill="none"
          stroke="#FFF0C9"
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${v} 100`}
          className={MOVE}
        />
      )}
    </svg>
  );
}

/** A ring, 0 to 100, starting at twelve o'clock. */
export function Ring({ value, className = '' }: { value: number; className?: string }) {
  const v = clampPercent(value);
  return (
    <svg viewBox="0 0 60 60" className={className} aria-hidden>
      <circle
        cx={30}
        cy={30}
        r={24}
        fill="none"
        stroke="rgb(var(--ds-border-subtle-rgb))"
        strokeWidth={7}
      />
      {v > 0 && (
        <circle
          cx={30}
          cy={30}
          r={24}
          fill="none"
          stroke="#FFF0C9"
          strokeWidth={7}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${v} 100`}
          transform="rotate(-90 30 30)"
          className={MOVE}
        />
      )}
    </svg>
  );
}

/**
 * A bar from zero to `max` with the alert threshold marked, so the reader sees
 * the headroom and not just the figure. Turns amber with the card at the
 * threshold.
 */
export function AlertBar({
  value,
  alert,
  max,
  alarmed,
  showScale = true,
}: {
  value: number;
  alert: number;
  max: number;
  alarmed: boolean;
  showScale?: boolean;
}) {
  const fill = clampPercent((value / max) * 100);
  const mark = clampPercent((alert / max) * 100);
  return (
    <div className="grid gap-1">
      <div
        role="img"
        aria-label={`${value.toFixed(1)}% drawdown, alert at ${alert}%`}
        className="relative mt-5 h-1.5 rounded-full bg-white/[0.06]"
      >
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${
            alarmed ? 'bg-ds-value-warning' : 'bg-ds-value-positive'
          } ${MOVE}`}
          style={{ width: `${fill}%` }}
        />
        <span
          aria-hidden
          className="absolute -bottom-[5px] -top-[5px] w-0.5 -translate-x-1/2 rounded-full bg-ds-value-warning"
          style={{ left: `${mark}%` }}
        />
        <span
          aria-hidden
          className="absolute -top-5 -translate-x-1/2 whitespace-nowrap font-mono text-[10.5px] font-medium text-ds-value-warning"
          style={{ left: `${mark}%` }}
        >
          {alert}% alert
        </span>
      </div>
      {showScale && (
        <div className="flex justify-between font-mono text-[11px] text-ds-text-muted" aria-hidden>
          <span>0%</span>
          <span>{max}%</span>
        </div>
      )}
    </div>
  );
}

/**
 * The tier path, every step named, the current one lit.
 *
 * `progress` is how far along the segment after the current tier the trader
 * is, 0 to 1. At the top tier there is no next segment and it is ignored.
 */
export function TierLadder({
  tiers,
  current,
  progress,
}: {
  tiers: string[];
  current: number;
  progress: number;
}) {
  const p = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <div className="grid gap-2">
      <div
        role="img"
        aria-label={`Tier ${current + 1} of ${tiers.length}: ${tiers[current]}`}
        className="flex items-center"
      >
        {tiers.map((tier, i) => (
          <span key={tier} className="contents">
            <span
              className={`h-3 w-3 shrink-0 rounded-full border-[1.5px] ${
                i <= current ? 'border-primary bg-primary' : 'border-ds-border-strong bg-ds-surface'
              } ${
                i === current
                  ? 'shadow-[0_0_0_5px_rgba(255,240,201,0.14),0_0_18px_rgba(255,240,201,0.35)]'
                  : ''
              }`}
            />
            {i < tiers.length - 1 && (
              <span
                className="h-0.5 flex-1"
                style={{
                  background:
                    i < current
                      ? '#FFF0C9'
                      : i === current
                        ? `linear-gradient(90deg, #FFF0C9 ${p}%, rgb(var(--ds-border-strong-rgb)) ${p}%)`
                        : 'rgb(var(--ds-border-strong-rgb))',
                }}
              />
            )}
          </span>
        ))}
      </div>
      <div className="flex justify-between text-[11px]" aria-hidden>
        {tiers.map((tier, i) => (
          <span key={tier} className={i === current ? 'text-primary' : 'text-ds-text-muted'}>
            {tier}
          </span>
        ))}
      </div>
    </div>
  );
}
