import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runScheduledCycle, DEFAULT_BUDGET_MS } from '@/lib/exchange/scheduler';

/**
 * The trading scheduler's trigger.
 *
 * Called on a schedule by the platform's cron (see vercel.json). This is the
 * only thing that causes signal flows to evaluate; without it a flow marked
 * 'running' never decides anything.
 *
 * Deliberately thin. It authenticates the caller and hands off - the decision
 * about what to do lives in src/lib/exchange/scheduler.ts so it can be
 * triggered another way later without this file being in the path.
 */

export const dynamic = 'force-dynamic';

/**
 * Wall-clock ceiling for the function, in seconds.
 *
 * Must exceed the scheduler's own budget, which stops handing out work at 45s.
 * The gap lets the last flow in flight finish and the lease be released
 * properly rather than being killed mid-venue-call.
 */
export const maxDuration = 60;

/**
 * Constant-time secret comparison.
 *
 * `===` on a secret leaks its length and, in principle, its prefix through
 * timing. This endpoint starts real trading activity, so it gets the careful
 * comparison even though the practical risk over HTTP is small.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, which would itself be a leak -
  // so length is checked first and the result folded in.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorize(request: NextRequest): string | null {
  const expected = (process.env.CRON_SECRET ?? '').trim();

  /*
   * Fail closed. An unset secret must not mean "open to everyone" on an
   * endpoint that places orders - anyone who could guess the path would be
   * able to drive the platform's trading cadence.
   */
  if (!expected) {
    return 'CRON_SECRET is not configured, so the scheduler will not run.';
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !secretMatches(token, expected)) {
    return 'Unauthorized.';
  }

  return null;
}

async function handle(request: NextRequest) {
  const denial = authorize(request);
  if (denial) {
    const misconfigured = denial.startsWith('CRON_SECRET');
    if (misconfigured) console.error(`[cron] ${denial}`);
    return NextResponse.json({ error: denial }, { status: misconfigured ? 503 : 401 });
  }

  const run = await runScheduledCycle(DEFAULT_BUDGET_MS);

  /*
   * Always 200 when the run was attempted, including when it was skipped for a
   * held lease. A non-2xx tells the cron platform to retry, and retrying a
   * trading cycle is a second chance to place an order that may already exist.
   * The body carries what happened.
   */
  return NextResponse.json({
    ran: run.ran,
    skipped: run.skippedReason ?? null,
    cycled: run.results.length,
    deferred: run.deferred,
    durationMs: run.durationMs,
    ...run.summary,
  });
}

/** Vercel Cron issues GET. */
export async function GET(request: NextRequest) {
  return handle(request);
}

/** POST for manual and external triggers, so the two cannot drift apart. */
export async function POST(request: NextRequest) {
  return handle(request);
}
