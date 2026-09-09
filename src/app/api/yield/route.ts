import { NextResponse } from 'next/server';
import { getYieldSnapshot } from '@/lib/defillama';

/**
 * GET /api/yield — live yield opportunities.
 *
 * Public data, no session required: these are published market rates, the same
 * ones anyone can read on DefiLlama, and nothing here is account-specific.
 *
 * No longer reads MongoDB. The `yieldopportunities` collection it used to
 * serve had no writer anywhere in the codebase and its eight rows all carried
 * the same July timestamp, so the endpoint was returning month-old constants
 * under a field called `apy`. See src/lib/defillama.ts.
 */

// Our own ten-minute cache lives in the service, so Next must not add a second
// caching layer with different semantics on top of it.
export const dynamic = 'force-dynamic';

export async function GET() {
  const snapshot = await getYieldSnapshot();

  if (!snapshot) {
    /*
     * Nothing cached and the upstream is unreachable. An empty list would
     * render as "no yield opportunities available", which reads as a fact
     * about the market rather than about our connection - so this is an
     * error, and the dashboard shows its retry control.
     */
    return NextResponse.json({ error: 'Yield data is temporarily unavailable' }, { status: 503 });
  }

  return NextResponse.json(snapshot);
}
