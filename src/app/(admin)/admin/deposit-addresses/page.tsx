import React from 'react';
import { Globe, Users } from 'lucide-react';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { DepositAddressModel, type DepositAddressScope } from '@/lib/models/DepositAddress';
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
  statusTone,
  when,
} from '@/components/admin-console/primitives';
import { AddressActions, DeleteAddress, PublishAddress } from './actions';

export const dynamic = 'force-dynamic';

const VIEWS = ['active', 'inactive', 'all', 'legacy'] as const;
type View = (typeof VIEWS)[number];

/**
 * The addresses the platform publishes.
 *
 * One per coin and network, shown to every trader. Inactive rows stay visible:
 * an address that was published can still receive funds long after it stopped
 * being current, and the first question when that happens is what it was and
 * what replaced it - which the history answers and a delete would not.
 */
export default async function DepositAddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireAdminPage('deposit_address.read');
  const { status = 'active' } = await searchParams;
  const canManage = ctx.can('deposit_address.manage');

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/deposit-addresses">
        <Card title="Database unavailable">
          <p className="text-ds-label text-ds-text-muted">The console cannot reach the database.</p>
        </Card>
      </ConsoleShell>
    );
  }

  // Narrowed against a whitelist rather than passed through. A query string is
  // user input even on an authenticated page, and this is what keeps an
  // arbitrary ?status= out of the filter.
  const view: View = (VIEWS as readonly string[]).includes(status) ? (status as View) : 'active';

  const query: { scope: DepositAddressScope; status?: 'active' | 'inactive' } = {
    scope: view === 'legacy' ? 'trader' : 'platform',
  };
  if (view === 'active' || view === 'inactive') query.status = view;

  const [rows, activeCount, legacyCount, pendingDeposits] = await Promise.all([
    DepositAddressModel.find(query)
      .sort({ status: 1, coin: 1, network: 1, createdAt: -1 })
      .limit(200)
      .lean(),
    DepositAddressModel.countDocuments({ scope: 'platform', status: 'active' }),
    DepositAddressModel.countDocuments({ scope: 'trader' }),
    DepositModel.countDocuments({ status: 'pending' }),
  ]);

  return (
    <ConsoleShell
      admin={ctx.admin}
      can={ctx.can}
      current="/admin/deposit-addresses"
      pendingBadges={{ '/admin/deposits': pendingDeposits }}
    >
      <PageHeading
        title="Deposit addresses"
        description="Published platform-wide: one address per coin and network, shown to every trader. Addresses are never edited in place — they are withdrawn or rotated."
        actions={canManage && view !== 'legacy' ? <PublishAddress /> : null}
      />

      {activeCount === 0 && view !== 'legacy' && (
        <Note tone="warning" className="mb-4 flex items-start gap-2">
          <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            No address is published, so no trader can deposit anything. Publish one per coin and
            network you intend to accept.
          </span>
        </Note>
      )}

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Filter addresses">
        {VIEWS.filter((tab) => tab !== 'legacy' || legacyCount > 0).map((tab) => (
          <a
            key={tab}
            href={`/admin/deposit-addresses?status=${tab}`}
            aria-current={view === tab ? 'page' : undefined}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 text-ds-label font-medium tracking-normal capitalize transition-colors duration-fast ease-ds-out ${
              view === tab
                ? 'bg-primary/12 text-primary'
                : 'text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text'
            }`}
          >
            {tab === 'legacy' && <Users className="h-3.5 w-3.5" aria-hidden="true" />}
            {tab === 'legacy' ? `retired per-trader (${legacyCount})` : tab}
          </a>
        ))}
      </nav>

      {view === 'legacy' && (
        <Note className="mb-4">
          Addresses from the old model, when each trader was assigned their own. They are retired
          and no trader is shown one. Kept because funds can still arrive at them, and this is the
          only record of whose they were.
        </Note>
      )}

      <Card>
        {rows.length === 0 ? (
          <Empty>No addresses in this view.</Empty>
        ) : (
          <Table
            head={
              view === 'legacy'
                ? ['Asset', 'Address', 'Label', 'Status', 'Created', '']
                : ['Asset', 'Address', 'Label', 'Status', 'Published', '']
            }
          >
            {rows.map((row) => (
              <Row key={String(row._id)}>
                <Cell>
                  <div className="font-semibold text-ds-text">{row.coin}</div>
                  <div className="text-ds-caption text-ds-text-muted">{row.network}</div>
                </Cell>
                <Cell mono className="max-w-xs whitespace-normal break-all">
                  {row.address}
                  {row.memoTag ? (
                    <div className="text-ds-text-muted">memo {row.memoTag}</div>
                  ) : null}
                </Cell>
                <Cell className="text-ds-caption text-ds-text-muted">{row.label || '—'}</Cell>
                <Cell>
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                  {row.deactivationReason ? (
                    <div className="mt-1 max-w-[14rem] text-ds-caption text-ds-text-muted">
                      {row.deactivationReason}
                    </div>
                  ) : null}
                  {row.replacedByAddressId ? (
                    <div className="mt-1 text-ds-caption text-ds-text-muted">rotated out</div>
                  ) : null}
                </Cell>
                <Cell mono>{when(row.createdAt)}</Cell>
                <Cell>
                  {canManage && row.status === 'active' && row.scope === 'platform' ? (
                    <AddressActions
                      addressId={String(row._id)}
                      coin={row.coin}
                      network={row.network}
                    />
                  ) : canManage && row.status === 'inactive' ? (
                    <DeleteAddress
                      addressId={String(row._id)}
                      coin={row.coin}
                      network={row.network}
                    />
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
