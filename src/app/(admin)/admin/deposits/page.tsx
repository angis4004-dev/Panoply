import React from 'react';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { DepositModel } from '@/lib/models/Deposit';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import {
  Badge,
  Card,
  Cell,
  Empty,
  Table,
  money,
  shortHash,
  statusTone,
  when,
} from '@/components/admin-console/primitives';
import { DepositDecision } from './decision';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'pending', label: 'Awaiting authorization' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
] as const;

export default async function DepositQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireAdminPage('deposit.read');
  const { status = 'pending' } = await searchParams;
  const canAuthorize = ctx.can('deposit.authorize');

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/deposits">
        <Card title="Database unavailable">
          <p className="text-ds-label text-ds-text-muted">The console cannot reach the database.</p>
        </Card>
      </ConsoleShell>
    );
  }

  // Narrowed against the tab list rather than passed through. A query string
  // is user input even on an authenticated page.
  const view = (TABS.find((tab) => tab.key === status) ?? TABS[0]).key;

  const [rows, pendingCount] = await Promise.all([
    DepositModel.find(view === 'all' ? {} : { status: view })
      .populate('userId', 'name email')
      // Oldest first while pending: a queue people work through should not
      // bury the deposit that has been waiting longest under this morning's.
      .sort(view === 'pending' ? { createdAt: 1 } : { createdAt: -1 })
      .limit(100)
      .lean(),
    DepositModel.countDocuments({ status: 'pending' }),
  ]);

  return (
    <ConsoleShell
      admin={ctx.admin}
      can={ctx.can}
      pendingBadges={{ '/admin/deposits': pendingCount }}
    >
      <PageHeading
        title="Deposit authorization"
        description="Nothing here has touched a balance. A deposit is credited only when it is authorized, and only through the ledger."
      />

      <nav className="mb-4 flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={`/admin/deposits?status=${tab.key}`}
            className={`rounded px-2.5 py-1.5 text-ds-label ${
              view === tab.key
                ? 'bg-ds-surface-inset text-ds-text'
                : 'text-ds-text-muted hover:bg-ds-surface-inset/60 hover:text-ds-text'
            }`}
          >
            {tab.label}
          </a>
        ))}
      </nav>

      {!canAuthorize && (
        <p className="mb-4 rounded border border-ds-border bg-ds-surface-raised/60 px-3 py-2 text-ds-caption text-ds-text-muted">
          You can read this queue but not decide on it. Authorizing a deposit requires the{' '}
          <span className="font-mono">deposit.authorize</span> permission.
        </p>
      )}

      <Card>
        {rows.length === 0 ? (
          <Empty>Nothing in this view.</Empty>
        ) : (
          <Table
            head={[
              'Received',
              'Trader',
              'Asset',
              'Amount sent',
              'Reference',
              'Status',
              'Credited',
              '',
            ]}
          >
            {rows.map((row) => {
              const user = row.userId as unknown as { name?: string; email?: string } | null;
              return (
                <tr key={String(row._id)}>
                  <Cell mono>{when(row.createdAt)}</Cell>
                  <Cell>
                    <div className="text-ds-text">{user?.name ?? 'Unknown'}</div>
                    <div className="text-ds-caption text-ds-text-muted">{user?.email ?? ''}</div>
                  </Cell>
                  <Cell>
                    <div>{row.coin}</div>
                    <div className="text-ds-caption text-ds-text-muted">{row.network}</div>
                  </Cell>
                  <Cell mono>{row.assetAmount}</Cell>
                  <Cell mono title={row.txReference}>
                    {shortHash(row.txReference)}
                  </Cell>
                  <Cell>
                    <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    {row.rejectionReason ? (
                      <div className="mt-1 max-w-xs text-ds-caption text-ds-text-muted">
                        {row.rejectionReason}
                      </div>
                    ) : null}
                  </Cell>
                  <Cell mono>{row.status === 'approved' ? money(row.creditAmountMinor) : '—'}</Cell>
                  <Cell>
                    {row.status === 'pending' && canAuthorize ? (
                      <DepositDecision
                        depositId={String(row._id)}
                        coin={row.coin}
                        network={row.network}
                        assetAmount={row.assetAmount}
                        txReference={row.txReference}
                        address={row.address}
                      />
                    ) : (
                      <span className="text-ds-caption text-ds-text-muted">
                        {row.reviewedAt ? when(row.reviewedAt) : '—'}
                      </span>
                    )}
                  </Cell>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </ConsoleShell>
  );
}
