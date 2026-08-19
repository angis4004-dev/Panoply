import React from 'react';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { WithdrawalModel, type WithdrawalStatus } from '@/lib/models/Withdrawal';
import { DepositModel } from '@/lib/models/Deposit';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import {
  Badge,
  Card,
  Cell,
  Empty,
  Note,
  Row,
  Table,
  money,
  shortHash,
  statusTone,
  when,
} from '@/components/admin-console/primitives';
import { serializeWithdrawalForConsole } from '@/lib/admin/withdrawals';
import { WithdrawalActions } from './actions';

export const dynamic = 'force-dynamic';

const VIEWS = ['pending', 'approved', 'paid', 'rejected', 'all'] as const;
type View = (typeof VIEWS)[number];

/**
 * The withdrawal queue.
 *
 * Two distinct jobs on one screen, and they are different decisions: deciding
 * whether a request is legitimate, and recording that the money actually went
 * out. A request sits in `approved` between them, which is the state that
 * matters operationally - the trader's wallet has been debited but nothing has
 * been sent, so anything stuck there is money owed.
 */
export default async function WithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireAdminPage('withdrawal.read');
  const { status = 'pending' } = await searchParams;
  const canReview = ctx.can('withdrawal.review');

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/withdrawals">
        <Card title="Database unavailable">
          <p className="text-ds-label text-ds-text-muted">The console cannot reach the database.</p>
        </Card>
      </ConsoleShell>
    );
  }

  // Narrowed against a whitelist: a query string is user input even on an
  // authenticated page.
  const view: View = (VIEWS as readonly string[]).includes(status) ? (status as View) : 'pending';
  const query: { status?: WithdrawalStatus } = {};
  if (view !== 'all') query.status = view;

  const [rows, pendingCount, awaitingPayment, pendingDeposits] = await Promise.all([
    WithdrawalModel.find(query)
      .sort({ createdAt: 1 })
      .limit(200)
      .populate('userId', 'name email')
      .lean(),
    WithdrawalModel.countDocuments({ status: 'pending' }),
    WithdrawalModel.countDocuments({ status: 'approved' }),
    DepositModel.countDocuments({ status: 'pending' }),
  ]);

  const withdrawals = rows.map((row) =>
    serializeWithdrawalForConsole(row as unknown as Record<string, unknown>)
  );

  const owed = withdrawals
    .filter((row) => row.status === 'approved')
    .reduce((sum, row) => sum + row.amountMinor, 0);

  return (
    <ConsoleShell
      admin={ctx.admin}
      can={ctx.can}
      current="/admin/withdrawals"
      pendingBadges={{
        '/admin/deposits': pendingDeposits,
        '/admin/withdrawals': pendingCount,
      }}
    >
      <PageHeading
        title="Withdrawals"
        description="Requests to take capital off the platform. Approving debits the trader's wallet; marking paid records the transfer that followed."
      />

      {awaitingPayment > 0 && (
        <Note tone="warning" className="mb-4">
          {awaitingPayment} approved {awaitingPayment === 1 ? 'withdrawal has' : 'withdrawals have'}{' '}
          not been marked paid. Those wallets are already debited
          {view === 'approved' ? '' : ' — money the platform owes but has not recorded sending'}.
        </Note>
      )}

      {!canReview && (
        <Note tone="neutral" className="mb-4">
          You can see the queue but not act on it. Deciding a withdrawal needs the withdrawal.review
          permission.
        </Note>
      )}

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Filter withdrawals">
        {VIEWS.map((tab) => (
          <a
            key={tab}
            href={`/admin/withdrawals?status=${tab}`}
            aria-current={view === tab ? 'page' : undefined}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 text-ds-label font-medium tracking-normal capitalize transition-colors duration-fast ease-ds-out ${
              view === tab
                ? 'bg-primary/12 text-primary'
                : 'text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text'
            }`}
          >
            {tab}
            {tab === 'pending' && pendingCount > 0 && <Badge tone="warning">{pendingCount}</Badge>}
          </a>
        ))}
      </nav>

      <Card
        title={view === 'all' ? 'All requests' : `${view[0].toUpperCase()}${view.slice(1)}`}
        description={
          owed > 0 ? `${money(owed)} approved and awaiting transfer on this view.` : undefined
        }
        bodyClassName="p-0"
      >
        {withdrawals.length === 0 ? (
          <div className="p-4">
            <Empty>Nothing here.</Empty>
          </div>
        ) : (
          <Table head={['Trader', 'Amount', 'Destination', 'Requested', 'Status', 'Action']}>
            {withdrawals.map((row) => (
              <Row key={row.id}>
                <Cell>
                  <div className="text-ds-text">{row.userName ?? '—'}</div>
                  <div className="text-ds-caption text-ds-text-muted">{row.userEmail ?? '—'}</div>
                </Cell>
                <Cell>
                  <div className="font-mono tabular-nums text-ds-text">
                    {money(row.amountMinor)}
                  </div>
                  <div className="text-ds-caption text-ds-text-muted">
                    {row.coin} · {row.networkKey}
                  </div>
                </Cell>
                <Cell>
                  <div className="font-mono text-ds-caption text-ds-text">
                    {shortHash(row.destinationAddress)}
                  </div>
                  {row.destinationMemo && (
                    <div className="font-mono text-ds-caption text-ds-value-warning">
                      Memo: {row.destinationMemo}
                    </div>
                  )}
                </Cell>
                <Cell>
                  <div className="text-ds-caption text-ds-text-muted">{when(row.createdAt)}</div>
                  <div className="text-ds-caption text-ds-text-muted">
                    {row.horizonAtRequest === 'long' ? '12-month term' : '3-month term'}
                  </div>
                </Cell>
                <Cell>
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                  {row.status === 'rejected' && row.rejectionReason && (
                    <div className="mt-1 text-ds-caption text-ds-text-muted">
                      {row.rejectionReason}
                    </div>
                  )}
                  {row.status === 'paid' && row.txReference && (
                    <div className="mt-1 break-all font-mono text-ds-caption text-ds-text-muted">
                      {shortHash(row.txReference)}
                    </div>
                  )}
                </Cell>
                <Cell>
                  {canReview ? (
                    <WithdrawalActions row={row} />
                  ) : (
                    <span className="text-ds-caption text-ds-text-muted">—</span>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </ConsoleShell>
  );
}
