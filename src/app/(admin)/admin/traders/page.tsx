import React from 'react';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import {
  Badge,
  Card,
  Cell,
  Empty,
  Table,
  money,
  statusTone,
  when,
} from '@/components/admin-console/primitives';
import { CreateTrader } from './create-trader';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function TradersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>;
}) {
  const ctx = await requireAdminPage('trader.read');
  const { search = '', status = '', page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/traders">
        <Card title="Database unavailable">
          <p className="text-ds-label text-ds-text-muted">The console cannot reach the database.</p>
        </Card>
      </ConsoleShell>
    );
  }

  const query: Record<string, unknown> = { role: 'Trader' };
  if (status) query.status = status;
  if (search.trim()) {
    // Escaped: an operator pasting a name with regex metacharacters should
    // search for it, not compile it.
    const safe = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ name: new RegExp(safe, 'i') }, { email: new RegExp(safe, 'i') }];
  }

  const [rows, total] = await Promise.all([
    UserModel.find(query)
      .select('name email status kycStatus riskProfile walletBalanceMinor createdAt')
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    UserModel.countDocuments(query),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/traders">
      <PageHeading
        title="Traders"
        description={`${total} account${total === 1 ? '' : 's'}.`}
        actions={ctx.can('trader.create') ? <CreateTrader /> : null}
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-ds-caption text-ds-text-muted">
            Search
            <input
              name="search"
              defaultValue={search}
              placeholder="Name or email"
              className="mt-0.5 block w-56 rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-label text-ds-text outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-ds-caption text-ds-text-muted">
            Status
            <select
              name="status"
              defaultValue={status}
              className="mt-0.5 block rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-label text-ds-text outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Any</option>
              <option value="active">Active</option>
              <option value="onboarding">Onboarding</option>
              <option value="flagged">Flagged</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-ds-surface-inset px-3 py-1.5 text-ds-label text-ds-text hover:bg-ds-surface-overlay"
          >
            Apply
          </button>
        </form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <Empty>No traders match this view.</Empty>
        ) : (
          <Table head={['Trader', 'Status', 'KYC', 'Risk', 'Wallet', 'Joined', '']}>
            {rows.map((row) => (
              <tr key={String(row._id)}>
                <Cell>
                  <div className="text-ds-text">{row.name}</div>
                  <div className="text-ds-caption text-ds-text-muted">{row.email}</div>
                </Cell>
                <Cell>
                  <Badge tone={statusTone(row.status ?? 'active')}>{row.status ?? 'active'}</Badge>
                </Cell>
                <Cell>
                  <Badge tone={statusTone(row.kycStatus ?? 'unverified')}>
                    {row.kycStatus ?? 'unverified'}
                  </Badge>
                </Cell>
                <Cell>{row.riskProfile ?? 'Balanced'}</Cell>
                <Cell mono>{money(row.walletBalanceMinor)}</Cell>
                <Cell mono>{when(row.createdAt)}</Cell>
                <Cell>
                  <Link
                    href={`/admin/traders/${String(row._id)}`}
                    className="text-ds-caption text-primary hover:underline"
                  >
                    Open
                  </Link>
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {pages > 1 && (
        <nav className="mt-4 flex items-center gap-2 text-ds-label">
          {page > 1 && (
            <Link
              href={`/admin/traders?search=${encodeURIComponent(search)}&status=${status}&page=${page - 1}`}
              className="rounded border border-ds-border-strong px-2 py-1 text-ds-text-secondary hover:bg-ds-surface-inset"
            >
              Previous
            </Link>
          )}
          <span className="text-ds-text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link
              href={`/admin/traders?search=${encodeURIComponent(search)}&status=${status}&page=${page + 1}`}
              className="rounded border border-ds-border-strong px-2 py-1 text-ds-text-secondary hover:bg-ds-surface-inset"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </ConsoleShell>
  );
}
