import { runScheduledCycle } from './scheduler';

/**
 * Runs the trading scheduler on a timer, in local development only.
 *
 * Vercel Cron drives the scheduler in production by calling
 * /api/cron/trading. Nothing calls it on a developer's machine, so without
 * this a locally-run platform lets you create and fund a signal flow that is
 * then never evaluated. That is indistinguishable, from the dashboard, from
 * the whole feature being broken.
 *
 * ## Why this is development-only, emphatically
 *
 * A production server running its own timer would mean every instance behind a
 * load balancer runs its own scheduler. They would be serialized by the
 * database lease, so nothing would double-trade - but the cadence would then
 * depend on how many instances happen to be warm, which is not a property
 * anyone should have to reason about when the thing being scheduled places
 * real orders. Cron is the single, external, observable trigger.
 *
 * The guard is therefore on NODE_ENV rather than on a variable someone could
 * set in a deployment environment by mistake.
 */

/** How often a dev cycle runs. Matches the production cron interval. */
const DEV_INTERVAL_MS = 5 * 60_000;

/**
 * Delay before the first cycle.
 *
 * Long enough for the dev server to finish booting and for a database
 * connection to be available, short enough that someone who just started a
 * flow sees something happen without wondering whether it works.
 */
const FIRST_RUN_DELAY_MS = 15_000;

/*
 * Module state, not a global. The dev server re-evaluates modules on change
 * but `register()` runs once per process, so a plain module-level flag is
 * enough to stop a second timer being created if that assumption ever breaks.
 */
let started = false;

export function startDevScheduler(): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (started) return;
  started = true;

  if (!(process.env.CRON_SECRET ?? '').trim()) {
    // Not fatal here - this path does not go through the HTTP endpoint and so
    // does not need the secret. Worth saying, because the same platform
    // deployed without it will not run at all.
    console.warn(
      '[dev-scheduler] CRON_SECRET is not set. Local cycles will still run, but /api/cron/trading will refuse every call and a deployment would not schedule anything.'
    );
  }

  console.info(
    `[dev-scheduler] Trading cycles every ${DEV_INTERVAL_MS / 60_000} minutes (development only). First run in ${FIRST_RUN_DELAY_MS / 1000}s.`
  );

  const tick = async () => {
    try {
      const run = await runScheduledCycle();
      if (!run.ran && run.skippedReason) {
        console.info(`[dev-scheduler] Skipped: ${run.skippedReason}`);
      }
    } catch (error) {
      // runScheduledCycle does not throw, but an import-time or connection
      // failure could surface here. A dead timer would silently stop local
      // trading, so it is reported rather than swallowed.
      console.error('[dev-scheduler] Cycle threw:', error);
    }
  };

  const first = setTimeout(tick, FIRST_RUN_DELAY_MS);
  const repeating = setInterval(tick, DEV_INTERVAL_MS);

  // Neither timer should hold the process open. Without this, stopping the dev
  // server waits out the interval.
  first.unref?.();
  repeating.unref?.();
}
