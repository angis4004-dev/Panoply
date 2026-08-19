/**
 * Server startup hook.
 *
 * Next.js calls `register()` once per server process, before any request is
 * handled. Used here for one thing: running the trading scheduler in local
 * development.
 *
 * In production the scheduler is driven by the platform's cron (see
 * vercel.json), which does not exist on a developer's machine. Without this,
 * `npm run dev` gives you a platform where flows can be created and funded but
 * are never evaluated - which looks exactly like the feature being broken.
 */

export async function register() {
  // Edge runtime also evaluates this file. Timers and database access belong
  // to the Node process only.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startDevScheduler } = await import('@/lib/exchange/dev-scheduler');
  startDevScheduler();
}
