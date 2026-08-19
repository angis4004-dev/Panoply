import React from 'react';
import { Network as NetworkIcon, TriangleAlert } from 'lucide-react';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { NetworkModel } from '@/lib/models/Network';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
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
} from '@/components/admin-console/primitives';
import { serializeNetwork } from '@/lib/admin/networks';
import { AddNetwork, NetworkActions, type EditableNetwork } from './actions';

export const dynamic = 'force-dynamic';

const VIEWS = ['active', 'inactive', 'all'] as const;
type View = (typeof VIEWS)[number];

/**
 * The chain catalog.
 *
 * Which networks exist, what a valid address looks like on each, and whether
 * money may move in or out over them. Rows are deactivated rather than
 * deleted: every deposit, payout address and withdrawal names a network by
 * key, and deleting one would orphan the history that explains it.
 */
export default async function NetworksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireAdminPage('network.read');
  const { status = 'active' } = await searchParams;
  const canManage = ctx.can('network.manage');

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/networks">
        <Card title="Database unavailable">
          <p className="text-ds-label text-ds-text-muted">The console cannot reach the database.</p>
        </Card>
      </ConsoleShell>
    );
  }

  // Narrowed against a whitelist. A query string is user input even on an
  // authenticated page.
  const view: View = (VIEWS as readonly string[]).includes(status) ? (status as View) : 'active';
  const query: { status?: 'active' | 'inactive' } = {};
  if (view !== 'all') query.status = view;

  const [rows, activeCount, addressCounts, pendingDeposits] = await Promise.all([
    NetworkModel.find(query).sort({ status: 1, sortOrder: 1, key: 1 }).limit(200).lean(),
    NetworkModel.countDocuments({ status: 'active' }),
    DepositAddressModel.aggregate<{ _id: string; count: number }>([
      { $match: { scope: 'platform', status: 'active' } },
      { $group: { _id: '$network', count: { $sum: 1 } } },
    ]),
    DepositModel.countDocuments({ status: 'pending' }),
  ]);

  const addressesByNetwork = new Map(addressCounts.map((entry) => [entry._id, entry.count]));
  const networks = rows.map((row) => serializeNetwork(row as unknown as Record<string, unknown>));
  const unchecked = networks.filter(
    (network) => network.status === 'active' && network.addressFamily === 'none'
  );

  return (
    <ConsoleShell
      admin={ctx.admin}
      can={ctx.can}
      current="/admin/networks"
      pendingBadges={{ '/admin/deposits': pendingDeposits }}
    >
      <PageHeading
        title="Networks"
        description="The chains the platform moves money on. The address format decides what counts as a valid address — it is checked on every deposit address published here and every payout wallet a trader saves."
        actions={canManage ? <AddNetwork /> : null}
      />

      {activeCount === 0 && (
        <Note tone="warning" className="mb-4 flex items-start gap-2">
          <NetworkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            No network is active, so no address can be published and no trader can deposit or
            withdraw. Add the chains you intend to accept.
          </span>
        </Note>
      )}

      {unchecked.length > 0 && (
        <Note tone="warning" className="mb-4 flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {unchecked.map((n) => n.key).join(', ')} {unchecked.length === 1 ? 'has' : 'have'} no
            address format set. Addresses on {unchecked.length === 1 ? 'it' : 'them'} are only
            length-checked, so an address for another chain will be accepted and anything sent to it
            is unrecoverable.
          </span>
        </Note>
      )}

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Filter networks">
        {VIEWS.map((tab) => (
          <a
            key={tab}
            href={`/admin/networks?status=${tab}`}
            aria-current={view === tab ? 'page' : undefined}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 text-ds-label font-medium tracking-normal capitalize transition-colors duration-fast ease-ds-out ${
              view === tab
                ? 'bg-primary/12 text-primary'
                : 'text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text'
            }`}
          >
            {tab}
          </a>
        ))}
      </nav>

      <Card>
        {networks.length === 0 ? (
          <Empty>No networks in this view.</Empty>
        ) : (
          <Table head={['Network', 'Address format', 'Coins', 'Money flow', 'Addresses', '']}>
            {networks.map((network) => {
              const published = addressesByNetwork.get(network.key) ?? 0;
              return (
                <Row key={network.id}>
                  <Cell>
                    <div className="font-semibold text-ds-text">{network.key}</div>
                    <div className="text-ds-caption text-ds-text-muted">{network.name}</div>
                    <Badge tone={statusTone(network.status)} className="mt-1">
                      {network.status}
                    </Badge>
                  </Cell>
                  <Cell>
                    <div className="text-ds-caption text-ds-text">
                      {network.addressFamily === 'none' ? (
                        <span className="text-warning">No format check</span>
                      ) : (
                        network.addressFamilyLabel.split(' (')[0]
                      )}
                    </div>
                    {network.addressFamily === 'custom' && (
                      <div className="font-mono text-ds-caption text-ds-text-muted">
                        {network.addressPrefix ? `${network.addressPrefix}…` : ''}
                        {network.addressCharset}, {network.addressMinLength}–
                        {network.addressMaxLength}
                      </div>
                    )}
                    {network.memoRequired ? (
                      <div className="text-ds-caption text-ds-text-muted">memo required</div>
                    ) : network.memoSupported ? (
                      <div className="text-ds-caption text-ds-text-muted">memo supported</div>
                    ) : null}
                  </Cell>
                  <Cell className="text-ds-caption text-ds-text-muted">
                    {network.coins.length > 0 ? network.coins.join(', ') : 'any'}
                  </Cell>
                  <Cell>
                    <div className="flex flex-col gap-0.5 text-ds-caption">
                      <span
                        className={network.depositEnabled ? 'text-ds-text' : 'text-ds-text-muted'}
                      >
                        {network.depositEnabled ? 'deposits open' : 'deposits closed'}
                      </span>
                      <span
                        className={
                          network.withdrawalEnabled ? 'text-ds-text' : 'text-ds-text-muted'
                        }
                      >
                        {network.withdrawalEnabled ? 'withdrawals open' : 'withdrawals closed'}
                      </span>
                      {network.minWithdrawalMinor !== null && (
                        <span className="text-ds-text-muted">
                          min ${(network.minWithdrawalMinor / 100).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </Cell>
                  <Cell mono>{published}</Cell>
                  <Cell>
                    {canManage ? (
                      <NetworkActions network={network as EditableNetwork} />
                    ) : (
                      <span className="text-ds-caption text-ds-text-muted">—</span>
                    )}
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>
    </ConsoleShell>
  );
}
