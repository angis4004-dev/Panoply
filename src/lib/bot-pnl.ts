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

// Sum of three uniforms approximates a bounded gaussian-ish curve (values
// cluster toward the middle, taper at the extremes) without needing a real
// normal-distribution sampler.
function randomStep(stddev: number): number {
  const u = Math.random() + Math.random() + Math.random() - 1.5;
  return u * stddev;
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
const LOSS_REGIME_PROBABILITY = 0.3;
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
 * Per-tick market drift for the regime containing this tick.
 *
 * Derived from the absolute tick index rather than Math.random() so that every
 * flow sees the same regime for the same wall-clock hour, even though each
 * computes its own catch-up in a separate request. Rolling independently would
 * lose the correlation, and with it the drawdowns.
 */
function marketDrift(tickIndex: number): number {
  const regime = Math.floor(tickIndex / TICKS_PER_REGIME);
  const pct = hash01(regime) < LOSS_REGIME_PROBABILITY ? DOWN_REGIME_PCT : UP_REGIME_PCT;
  return pct / TICKS_PER_REGIME;
}

export interface TickableBot {
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

  // Absolute tick index, counted from the epoch rather than from this bot's
  // lastTickAt, so two flows that started on different days still line up on
  // the same market moves for any given moment in time.
  const firstTick = Math.floor(bot.lastTickAt.getTime() / TICK_INTERVAL_MS);

  let delta = 0;
  for (let i = 0; i < ticksApplied; i++) {
    delta += bias + marketDrift(firstTick + i) + randomStep(IDIOSYNCRATIC_STDDEV);
  }

  return {
    ticksApplied,
    simulatedPnlPercent: bot.simulatedPnlPercent + delta,
    lastTickAt: new Date(bot.lastTickAt.getTime() + ticksApplied * TICK_INTERVAL_MS),
  };
}

export function formatPnl(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
