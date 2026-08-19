import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { WithdrawalModel, type WithdrawalStatus } from '@/lib/models/Withdrawal';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { serializeWithdrawalForConsole } from '@/lib/admin/withdrawals';

const STATUSES = ['pending', 'approved', 'paid', 'rejected'] as const;

/** The withdrawal queue. Oldest first, matching how deposits are worked. */
export async function GET(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'withdrawal.read');
  if (!guard.ok) return guard.response;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const status = request.nextUrl.searchParams.get('status');
  const query: { status?: WithdrawalStatus } = {};
  if (status && (STATUSES as readonly string[]).includes(status)) {
    query.status = status as WithdrawalStatus;
  }

  const rows = await WithdrawalModel.find(query)
    // Pending first, then oldest first inside each group: the queue should
    // open on the work, not on the archive.
    .sort({ status: 1, createdAt: 1 })
    .limit(200)
    .populate('userId', 'name email')
    .lean();

  return adminJson({
    withdrawals: rows.map((row) =>
      serializeWithdrawalForConsole(row as unknown as Record<string, unknown>)
    ),
  });
}
