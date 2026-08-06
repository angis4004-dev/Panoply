/**
 * Persisted dry-run earnings simulation.
 *
 * Each running signal flow books a small gain or loss every TICK_INTERVAL_MS,
 * accumulating into simulatedPnlPercent - stored on the bot, not recomputed
 * from scratch on each view, so it keeps moving across the day and survives
 * refresh/restart exactly like a real running strategy's P&L would.
 *
 * Ticks are applied as "catch-up": whoever next reads the bot (via GET
 * /api/bots) computes how many 30s intervals have elapsed since lastTickAt
 * and applies that many steps of a small random walk, biased by confidence.
 * This avoids needing a persistent background process or cron - the value
 * is always correct-as-of-last-read regardless of how long the app sat idle.
 */

export const TICK_INTERVAL_MS = 30_000;

// Bounds how many ticks a single catch-up computes. A bot left alone for a
// week would otherwise force one request to loop tens of thousands of times;
// capping it means any backlog beyond ~24h of ticks is simply carried
// forward and finished off across the next few reads instead of one.
const MAX_TICKS_PER_CATCHUP = 2_880; // 24h worth of 30s ticks

/**
 * Per-tick drift, in percentage points.
 *
 * These were previously 100x larger (-0.01 to +0.02 per tick). At 120 ticks an
 * hour and 20,160 a week that compounded to roughly +320% per week for a
 * high-confidence flow - a signal flow tripling capital every week is not a
 * believable number to show anyone, let alone on a platform describing itself
 * as institutional. It was also the direct cause of the cumulative chart being
 * a straight ramp: drift that large buries any volatility underneath it.
 *
 * Now scaled down further still, because the market regime below carries most
 * of the movement. Confidence only tilts a flow slightly for or against the
 * prevailing regime - a higher-confidence flow gives back a little less in a
 * losing hour. Restore the larger values and the tilt starts overpowering the
 * regimes, which is what determines the 70/30 split.
 */
function tickBias(confidence: number): number {
  const c = Math.max(0, Math.min(100, confidence)) / 100;
  return (-0.0001 + c * 0.0004) * 0.25;
}

/**
 * Per-flow jitter, derived from the tick index rather than Math.random().
 *
 * This is what makes the whole P&L path reproducible. With a random component
 * the value at 3pm yesterday existed only if something happened to record it,
 * which is why the chart could only ever plot the handful of moments a
 * dashboard was open. Seeded from the absolute tick index and the flow's own
 * id, the same tick always yields the same jitter, so the curve between any
 * two points can be reconstructed exactly instead of sampled.
 *
 * Sum of three uniforms approximates a bounded gaussian-ish curve (values
 * cluster toward the middle, taper at the extremes) without needing a real
 * normal-distribution sampler.
 */
function idiosyncratic(tickIndex: number, seed: number): number {
  const base = Math.imul(tickIndex, 3) ^ seed;
  const u = hash01(base) + hash01(base + 1) + hash01(base + 2) - 1.5;
  return u * IDIOSYNCRATIC_STDDEV;
}

/** Stable numeric seed from a flow's id, so two flows jitter independently. */
export function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/**
 * The market moves in hourly regimes: 70% of hours trend up, 30% trend down,
 * with a losing hour costing more than a winning hour gains.
 *
 * Symmetric noise could not deliver both things at once. The share of up-hours
 * is Phi(drift / volatility) while dip depth scales with volatility, so tuning
 * for a 70% win rate drove peak drawdown down to 0.095% - about 2% of the
 * week's gain, a hairline on any axis. Asymmetry breaks that trade-off: many
 * modest gains against fewer larger losses hold the win rate at 70% while
 * still cutting visible drawdowns into the curve. It is also how a
 * high-win-rate strategy genuinely behaves.
 *
 * Regimes are keyed to the absolute hour, so every flow shares them - a losing
 * hour hits the whole portfolio at once, which is what makes a drawdown
 * survive being summed across flows rather than averaging away.
 */
const TICKS_PER_REGIME = 120; // one hour at 30s ticks
const HOURS_PER_DAY = 24;
/**
 * Down hours per calendar day, fixed rather than drawn per hour.
 *
 * Independent 30% draws give the right long-run average but not the right day.
 * With only 24 draws the daily up-share has a standard deviation of about 9
 * points, so individual days landed anywhere from ~51% to ~89% up - a measured
 * 24-hour window read 83% up while the week around it read 65%. Allocating a
 * fixed quota per day makes every day 17 up hours and 7 down, which is the
 * 70/30 split as actually specified.
 */
const DOWN_HOURS_PER_DAY = 7; // 7/24 = 29.2%
const UP_REGIME_PCT = 0.15; // gained across a winning hour
const DOWN_REGIME_PCT = -0.25; // lost across a losing hour

// Small per-flow jitter so two flows in the same regime are not identical.
// Deliberately far below the regime move: raise it and the regimes blur back
// into symmetric noise, taking the 70/30 split with them.
const IDIOSYNCRATIC_STDDEV = 0.004;

/** Deterministic hash of an integer to [0, 1). */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Which hours of a given day are losing hours, as a 24-bit mask.
 *
 * Deterministically shuffles the day's hours and marks the first
 * DOWN_HOURS_PER_DAY of them, so the quota is exact and the placement still
 * varies from day to day. Keyed on the day since the epoch, so every flow
 * agrees about which hours were bad - a losing hour has to hit the whole
 * portfolio at once, or drawdowns average away when flows are summed.
 */
const dayMaskCache = new Map<number, number>();

function downHourMask(day: number): number {
  const cached = dayMaskCache.get(day);
  if (cached !== undefined) return cached;

  const order = Array.from({ length: HOURS_PER_DAY }, (_, i) => i);
  for (let i = HOURS_PER_DAY - 1; i > 0; i--) {
    const j = Math.floor(hash01(Math.imul(day, 0x27d4eb2f) + i) * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }

  let mask = 0;
  for (let i = 0; i < DOWN_HOURS_PER_DAY; i++) mask |= 1 << order[i];

  // Bounded: a year of projection touches 365 days, and the cache is only an
  // optimisation, so dropping it wholesale is cheaper than tracking ages.
  if (dayMaskCache.size > 2000) dayMaskCache.clear();
  dayMaskCache.set(day, mask);
  return mask;
}

/**
 * Per-tick market drift for the regime containing this tick.
 *
 * Derived from the absolute tick index rather than Math.random() so that every
 * flow sees the same regime for the same wall-clock hour, even though each
 * computes its own catch-up in a separate request. Rolling independently would
 * lose the correlation, and with it the drawdowns.
 */
function marketDrift(tickIndex: number): number {
  const hour = Math.floor(tickIndex / TICKS_PER_REGIME);
  const day = Math.floor(hour / HOURS_PER_DAY);
  const hourOfDay = ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
  const isDown = (downHourMask(day) & (1 << hourOfDay)) !== 0;
  return (isDown ? DOWN_REGIME_PCT : UP_REGIME_PCT) / TICKS_PER_REGIME;
}

/**
 * Intra-hour texture, in percentage points, that is exactly zero at every hour
 * boundary.
 *
 * The regime model alone produces a line that ramps smoothly from one hourly
 * close to the next, which reads as mechanical - the shape is fully implied by
 * which hour you are in. Real price series are jagged at every scale, with
 * reversals and the occasional sharp wick.
 *
 * Adding plain noise to the accumulation would have broken the 70/30 split,
 * because it would push hourly closes around. This is a displacement of the
 * LEVEL rather than a change to the trend, shaped by a sine envelope that
 * vanishes at both ends of the regime. It is fed into the accumulation as the
 * difference between consecutive values, so a full hour telescopes to zero and
 * the hourly close is still decided purely by the regime.
 *
 * Three octaves: per-tick, ~2-minute, and ~6-minute, so the line has detail at
 * more than one scale instead of looking like uniform fuzz.
 */
const WIGGLE_AMPLITUDE = 0.09;
const SPIKE_PROBABILITY = 0.015;
const SPIKE_MULTIPLIER = 3.2;

function wiggle(tickIndex: number, seed: number): number {
  const pos = ((tickIndex % TICKS_PER_REGIME) + TICKS_PER_REGIME) % TICKS_PER_REGIME;
  if (pos === 0) return 0;

  const envelope = Math.sin(Math.PI * (pos / TICKS_PER_REGIME));
  const fine = Math.imul(tickIndex, 0x9e3779b1) ^ seed;

  let n = (hash01(fine) - 0.5) * 1.0;
  n += (hash01((Math.floor(tickIndex / 4) ^ seed ^ 0x51ed2701) >>> 0) - 0.5) * 1.7;
  n += (hash01((Math.floor(tickIndex / 13) ^ seed ^ 0x2f6b1a3d) >>> 0) - 0.5) * 2.4;

  // Rare impulse, so the series occasionally throws a wick instead of only
  // ever breathing gently. Self-correcting: the envelope pulls it back.
  if (hash01((fine ^ 0x7f4a7c15) >>> 0) < SPIKE_PROBABILITY) n *= SPIKE_MULTIPLIER;

  return envelope * n * WIGGLE_AMPLITUDE;
}

/** Combined per-tick move: confidence tilt, shared market regime, own jitter. */
function tickDelta(tickIndex: number, bias: number, seed: number): number {
  return (
    bias +
    marketDrift(tickIndex) +
    idiosyncratic(tickIndex, seed) +
    // Telescopes across a regime, so it textures the path without moving the
    // hourly close that the 70/30 quota is measured on.
    (wiggle(tickIndex + 1, seed) - wiggle(tickIndex, seed))
  );
}

export interface TickableBot {
  id: string;
  status: 'running' | 'paused' | 'fallback';
  confidence: number;
  simulatedPnlPercent: number;
  lastTickAt: Date;
}

export interface TickResult {
  ticksApplied: number;
  simulatedPnlPercent: number;
  lastTickAt: Date;
}

/**
 * Pure catch-up computation - no I/O. Only 'running' bots accrue ticks;
 * paused/fallback bots are returned unchanged so their lastTickAt doesn't
 * drift while they're not earning (see the model's lastTickAt comment for
 * why that matters on resume).
 */
export function applyPendingTicks(bot: TickableBot, now: Date = new Date()): TickResult {
  if (bot.status !== 'running') {
    return {
      ticksApplied: 0,
      simulatedPnlPercent: bot.simulatedPnlPercent,
      lastTickAt: bot.lastTickAt,
    };
  }

  const elapsedMs = now.getTime() - bot.lastTickAt.getTime();
  const ticksAvailable = Math.floor(elapsedMs / TICK_INTERVAL_MS);
  if (ticksAvailable <= 0) {
    return {
      ticksApplied: 0,
      simulatedPnlPercent: bot.simulatedPnlPercent,
      lastTickAt: bot.lastTickAt,
    };
  }

  const ticksApplied = Math.min(ticksAvailable, MAX_TICKS_PER_CATCHUP);
  const bias = tickBias(bot.confidence);
  const seed = seedFromId(bot.id);

  // Absolute tick index, counted from the epoch rather than from this bot's
  // lastTickAt, so two flows that started on different days still line up on
  // the same market moves for any given moment in time.
  const firstTick = Math.floor(bot.lastTickAt.getTime() / TICK_INTERVAL_MS);

  let delta = 0;
  for (let i = 0; i < ticksApplied; i++) {
    delta += tickDelta(firstTick + i, bias, seed);
  }

  return {
    ticksApplied,
    simulatedPnlPercent: bot.simulatedPnlPercent + delta,
    lastTickAt: new Date(bot.lastTickAt.getTime() + ticksApplied * TICK_INTERVAL_MS),
  };
}

export interface ProjectableBot extends TickableBot {
  createdAt: Date;
}

/**
 * Reconstructs a flow's P&L at each of `sampleTimesMs`.
 *
 * The chart used to plot PortfolioSnapshot rows, which are only written when
 * someone loads the dashboard. That made the x-axis a record of when the page
 * happened to be open rather than a period of time: asking for "1 day" and
 * getting 3:37am to 7:03am was not a bug in the axis, it was the only data
 * that existed. There was also nothing to read between two snapshots hours
 * apart, so hovering most of the chart reported a value that had been
 * interpolated rather than reached.
 *
 * Because every component of a tick is now deterministic, the value at any
 * past moment can be recomputed instead. This is reconstruction, not
 * invention: the flow genuinely held that value at that time, we simply had
 * no reason to write it down.
 *
 * Anchored on simulatedPnlPercent - the stored, authoritative figure as of
 * lastTickAt - and walked outwards, so the curve always meets the number
 * shown elsewhere in the dashboard. Paused flows do not accrue, so their
 * anchor stops advancing and the projection is flat after it, which is what
 * actually happened.
 */
export function pnlPercentSeries(bot: ProjectableBot, sampleTimesMs: number[]): number[] {
  if (sampleTimesMs.length === 0) return [];

  const bias = tickBias(bot.confidence);
  const seed = seedFromId(bot.id);
  const createdTick = Math.floor(bot.createdAt.getTime() / TICK_INTERVAL_MS);
  const anchorTick = Math.floor(bot.lastTickAt.getTime() / TICK_INTERVAL_MS);

  // Sample ticks are clamped to the flow's own lifetime. Before it existed it
  // contributed nothing; a paused flow stops at its anchor rather than
  // continuing to earn while switched off.
  const maxTick = bot.status === 'running' ? Infinity : anchorTick;
  const sampleTicks = sampleTimesMs.map((ms) =>
    Math.min(Math.max(Math.floor(ms / TICK_INTERVAL_MS), createdTick), maxTick)
  );

  // One pass over the tick range, recording the running sum relative to the
  // anchor, rather than re-summing from scratch for every sample. A year at
  // 30-second ticks is ~1M iterations; per-sample summing would be ~365x that.
  const lo = Math.min(anchorTick, ...sampleTicks);
  const hi = Math.max(anchorTick, ...sampleTicks);

  const relative = new Map<number, number>();
  let running = 0;
  relative.set(anchorTick, 0);

  for (let t = anchorTick - 1; t >= lo; t--) {
    running -= tickDelta(t, bias, seed);
    relative.set(t, running);
  }
  running = 0;
  for (let t = anchorTick + 1; t <= hi; t++) {
    running += tickDelta(t - 1, bias, seed);
    relative.set(t, running);
  }

  return sampleTicks.map((tick, i) => {
    if (sampleTimesMs[i] < bot.createdAt.getTime()) return 0;
    return bot.simulatedPnlPercent + (relative.get(tick) ?? 0);
  });
}

export function formatPnl(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
