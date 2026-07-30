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

// Per-tick drift, in percentage points. Confidence maps 0-100 to a bias of
// roughly -0.010% to +0.020% per tick (higher-confidence flows trend
// positive more often, but never deterministically - every tick still rolls
// its own random step, so a high-confidence flow can still have a red day).
function tickBias(confidence: number): number {
  const c = Math.max(0, Math.min(100, confidence)) / 100;
  return -0.01 + c * 0.03;
}

// Sum of three uniforms approximates a bounded gaussian-ish curve (values
// cluster toward the middle, taper at the extremes) without needing a real
// normal-distribution sampler.
function randomStep(stddev: number): number {
  const u = Math.random() + Math.random() + Math.random() - 1.5;
  return u * stddev;
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
  let delta = 0;
  for (let i = 0; i < ticksApplied; i++) {
    delta += bias + randomStep(0.12);
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
