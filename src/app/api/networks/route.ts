import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { connectToDatabase } from '@/lib/mongo';
import { NetworkModel } from '@/lib/models/Network';
import { serializeNetworkForTrader } from '@/lib/admin/networks';

/**
 * The chains a trader may use, and what a valid address looks like on each.
 *
 * The address rule is included so the deposit and withdrawal forms can reject
 * a wrong-chain paste before it leaves the browser. That is a convenience, not
 * the control: every write path re-checks server-side against the same rule,
 * because a client-side check is a suggestion to anyone holding a terminal.
 *
 * `?for=withdrawal` narrows to networks payouts are open on. Deposits and
 * withdrawals have separate switches - a chain can be taking money in while
 * its hot wallet is refilled - so the two callers must not share a list.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const purpose = request.nextUrl.searchParams.get('for');
  const query: Record<string, unknown> = { status: 'active' };
  if (purpose === 'withdrawal') query.withdrawalEnabled = true;
  if (purpose === 'deposit') query.depositEnabled = true;

  const networks = await NetworkModel.find(query).sort({ sortOrder: 1, key: 1 }).lean();

  return NextResponse.json({
    networks: networks.map((entry) =>
      serializeNetworkForTrader(entry as unknown as Record<string, unknown>)
    ),
  });
}
