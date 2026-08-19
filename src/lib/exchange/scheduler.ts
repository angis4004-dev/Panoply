import { connectToDatabase } from '@/lib/mongo';
import { acquireLease, releaseLease } from '@/lib/models/SchedulerLock';
import { runAllFlows, type CycleResult } from './execution';

/**
 * What actually makes signal flows run.
 *
 * Everything under src/lib/strategy and src/lib/exchange decides and executes,
 * but none of it wakes up on its own. This is the thing that wakes it up, and
 * without it a flow marked 'running' sits there deciding nothing - which is
 * exactly what "I started a flow and nothing happened" looks like.
 *
 * Invoked by POST /api/cron/trading on a schedule (see vercel.json). Kept
 * separate from that route so the trigger can change - a different host, a
 * worker, a manual button - without touching the logic.
 */

export const TRADING_LOCK = 'trading-cycle';

/**
 * How long a run may hold the lease.
 *
 * Comfortably longer than the time budget below, so a run that uses its whole
 * budget still releases the lease itself rather than having it expire
 * underneath it. The gap between the two is the margin for the final flow to
 * finish and for the release to be written.
 */
export const LEASE_TTL_SECONDS = 300;

/**
 * How long a run may spend placing orders before it stops handing out work.
 *
 * Serverless functions are killed at a hard wall-clock limit, and a kill in
 * the middle of a venue call is the worst possible moment - it leaves an order
 * that may or may not exist upstream. Stopping early and voluntarily means the
 * next run picks up the remaining flows, which is safe because the flow order
 * rotates. Set below the platform's function timeout, not at it.
 */
export const DEFAULT_BUDGET_MS = 45_000;

export interface SchedulerRun {
  ran: boolean;
  /** Present when the run was skipped because another holds the lease. */
  skippedReason?: string;
  results: CycleResult[];
  /** Flows left for the next run because this one ran out of time. */
  deferred: number;
  durationMs: number;
  /** Counts by action, for the log line and the console. */
  summary: { placed: number; held: number; refused: number; failed: number };
}

/**
 * Bucket the cycle results for the operator-facing count.
 *
 * `orderId` is checked before `refusedBy` deliberately. A cycle can carry
 * both - an order placed, then a later step reporting a problem - and an order
 * that reached the venue must be counted as placed whatever happened
 * afterwards. Counting it as refused would under-report real orders, which is
 * the one direction this number must never be wrong in.
 */
export function summarize(results: CycleResult[]): SchedulerRun['summary'] {
  const summary = { placed: 0, held: 0, refused: 0, failed: 0 };
  for (const result of results) {
    if (result.orderId) summary.placed += 1;
    else if (result.refusedBy === 'error') summary.failed += 1;
    else if (result.refusedBy) summary.refused += 1;
    else summary.held += 1;
  }
  return summary;
}

/**
 * Run one scheduled trading cycle across every running flow.
 *
 * Never throws. A scheduler that throws gets retried by the platform, and a
 * retried trading cycle is a second chance to place the same order - so a
 * failure here is reported as data and the run is simply over.
 *
 * The lease is released in a `finally`. Skipping that on the error path would
 * block every subsequent run until the TTL lapsed, turning one bad cycle into
 * five minutes of silence.
 */
export async function runScheduledCycle(budgetMs = DEFAULT_BUDGET_MS): Promise<SchedulerRun> {
  const startedAt = Date.now();
  const empty: SchedulerRun = {
    ran: false,
    results: [],
    deferred: 0,
    durationMs: 0,
    summary: { placed: 0, held: 0, refused: 0, failed: 0 },
  };

  const connection = await connectToDatabase();
  if (!connection) {
    return { ...empty, skippedReason: 'Database unavailable.', durationMs: Date.now() - startedAt };
  }

  const lease = await acquireLease(TRADING_LOCK, LEASE_TTL_SECONDS, `pid-${process.pid}`);
  if (!lease.acquired) {
    /*
     * Not an error. Overlapping ticks are normal when a cycle runs long, and
     * the correct response is to do nothing - the run already in progress is
     * covering these flows.
     */
    return {
      ...empty,
      skippedReason: `Another cycle is already running${
        lease.heldUntil ? ` (lease held until ${lease.heldUntil.toISOString()})` : ''
      }.`,
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    const { results, skipped } = await runAllFlows({ deadline: startedAt + budgetMs });
    const summary = summarize(results);

    console.info(
      `[scheduler] ${results.length} flows cycled in ${Date.now() - startedAt}ms - ` +
        `${summary.placed} placed, ${summary.held} held, ${summary.refused} refused, ` +
        `${summary.failed} failed, ${skipped} deferred.`
    );

    return {
      ran: true,
      results,
      deferred: skipped,
      durationMs: Date.now() - startedAt,
      summary,
    };
  } catch (error) {
    console.error('[scheduler] Cycle failed:', error);
    return {
      ...empty,
      ran: true,
      skippedReason: error instanceof Error ? error.message : 'Unknown error.',
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await releaseLease(TRADING_LOCK);
  }
}
