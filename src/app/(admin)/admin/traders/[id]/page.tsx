import React from 'react';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { DepositModel } from '@/lib/models/Deposit';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
import { LedgerEntryModel } from '@/lib/models/LedgerEntry';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { objectId } from '@/lib/validation';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import {
  Badge,
  Card,
  Cell,
  Empty,
  Stat,
  Table,
  money,
  shortHash,
  statusTone,
  when,
} from '@/components/admin-console/primitives';
import { TraderControls } from './controls';
import { BalanceAdjustment } from './balance-adjustment';

export const dynamic = 'force-dynamic';

/**
 * One trader, end to end.
 *
 * Everything an operator needs to answer a question about this account -
 * addresses, deposits, the ledger, and what admins have done to it - on one
 * page, because the alternative is reconstructing it from four screens and
 * getting it wrong.
 */
export default async function TraderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminPage('trader.read');
  const { id } = await params;
  if (!objectId.safeParse(id).success) notFound();

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

  const trader = await UserModel.findOne({ _id: id, role: 'Trader' })
    .select(
      'name email status kycStatus riskProfile walletBalanceMinor lifetimeDeposited tier notes createdAt lastActiveDate'
    )
    .lean();
  if (!trader) notFound();

  const [addresses, deposits, ledger, history] = await Promise.all([
    // Only this trader's retired per-trader rows. Platform addresses are the
    // same for everybody, so listing them here would say nothing about this
    // account - they live on /admin/deposit-addresses.
    ctx.can('deposit_address.read')
      ? DepositAddressModel.find({ userId: id, scope: 'trader' }).sort({ createdAt: -1 }).lean()
      : Promise.resolve([]),
    ctx.can('deposit.read')
      ? DepositModel.find({ userId: id }).sort({ createdAt: -1 }).limit(25).lean()
      : Promise.resolve([]),
    LedgerEntryModel.find({ userId: id }).sort({ createdAt: -1 }).limit(25).lean(),
    ctx.can('audit.read')
      ? AdminAuditLogModel.find({ affectedUserId: id }).sort({ createdAt: -1 }).limit(50).lean()
      : Promise.resolve([]),
  ]);

  const balanceMinor = trader.walletBalanceMinor ?? 0;

  return (
    <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/traders">
      <PageHeading
        title={trader.name}
        description={trader.email}
        actions={
          ctx.can('trader.update') ? (
            <TraderControls
              traderId={id}
              status={trader.status ?? 'active'}
              riskProfile={trader.riskProfile ?? 'Balanced'}
              notes={trader.notes ?? ''}
              canSuspend={ctx.can('trader.suspend')}
            />
          ) : null
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Wallet balance" value={money(balanceMinor)} hint="Maintained by the ledger" />
        <Stat label="Lifetime deposited" value={money((trader.lifetimeDeposited ?? 0) * 100)} />
        <Stat
          label="Status"
          value={
            <Badge tone={statusTone(trader.status ?? 'active')}>{trader.status ?? 'active'}</Badge>
          }
        />
        <Stat
          label="KYC"
          value={
            <Badge tone={statusTone(trader.kycStatus ?? 'unverified')}>
              {trader.kycStatus ?? 'unverified'}
            </Badge>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rendered only when this trader has history under the old model.
            There is nothing to assign any more - deposit addresses are
            published platform-wide - so an empty card here would be a
            permanent blank telling the operator nothing. */}
        {ctx.can('deposit_address.read') && addresses.length > 0 && (
          <Card
            title="Retired addresses"
            description="Assigned to this trader before addresses became platform-wide. Kept because funds can arrive at a withdrawn address days later."
          >
            <Table head={['Asset', 'Address', 'Status', 'Assigned']}>
              {addresses.map((row) => (
                <tr key={String(row._id)}>
                  <Cell>
                    <div>{row.coin}</div>
                    <div className="text-ds-caption text-ds-text-muted">{row.network}</div>
                  </Cell>
                  <Cell mono className="break-all">
                    {row.address}
                    {row.memoTag ? (
                      <div className="text-ds-text-muted">memo {row.memoTag}</div>
                    ) : null}
                  </Cell>
                  <Cell>
                    <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    {row.deactivationReason ? (
                      <div className="mt-1 text-ds-caption text-ds-text-muted">
                        {row.deactivationReason}
                      </div>
                    ) : null}
                  </Cell>
                  <Cell mono>{when(row.createdAt)}</Cell>
                </tr>
              ))}
            </Table>
          </Card>
        )}

        {ctx.can('deposit.read') && (
          <Card title="Deposits">
            {deposits.length === 0 ? (
              <Empty>No deposits recorded.</Empty>
            ) : (
              <Table head={['When', 'Asset', 'Sent', 'Credited', 'Status']}>
                {deposits.map((row) => (
                  <tr key={String(row._id)}>
                    <Cell mono>{when(row.createdAt)}</Cell>
                    <Cell>{row.coin}</Cell>
                    <Cell mono>{row.assetAmount}</Cell>
                    <Cell mono>
                      {row.status === 'approved' ? money(row.creditAmountMinor) : '—'}
                    </Cell>
                    <Cell>
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </Cell>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )}

        <Card
          title="Ledger"
          description="The authoritative record. The balance above is a view of these entries."
          actions={
            ctx.can('ledger.adjust') ? (
              <BalanceAdjustment traderId={id} currentBalanceMinor={balanceMinor} />
            ) : null
          }
        >
          {ledger.length === 0 ? (
            <Empty>No entries.</Empty>
          ) : (
            <Table head={['When', 'Type', 'Amount', 'Balance after', 'Memo']}>
              {ledger.map((row) => (
                <tr key={String(row._id)}>
                  <Cell mono>{when(row.createdAt)}</Cell>
                  <Cell mono>{row.type}</Cell>
                  <Cell
                    mono
                    className={
                      row.amountMinor < 0 ? 'text-ds-value-negative' : 'text-ds-value-positive'
                    }
                  >
                    {row.amountMinor < 0 ? '−' : '+'}
                    {money(Math.abs(row.amountMinor))}
                  </Cell>
                  <Cell mono>{money(row.balanceAfterMinor)}</Cell>
                  <Cell className="max-w-xs text-ds-caption text-ds-text-muted">
                    {row.memo || '—'}
                  </Cell>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {ctx.can('audit.read') && (
          <Card title="Account history" description="Every admin action taken on this account.">
            {history.length === 0 ? (
              <Empty>Nothing recorded.</Empty>
            ) : (
              <Table head={['When', 'Admin', 'Action', 'Reason', 'Reference']}>
                {history.map((row) => (
                  <tr key={String(row._id)}>
                    <Cell mono>{when(row.createdAt)}</Cell>
                    <Cell className="text-ds-caption">{row.actorEmail}</Cell>
                    <Cell mono>{row.action}</Cell>
                    <Cell className="max-w-xs text-ds-caption text-ds-text-muted">
                      {row.reason || '—'}
                    </Cell>
                    <Cell mono className="text-ds-caption" title={row.reference || undefined}>
                      {row.reference ? shortHash(row.reference, 8, 6) : '—'}
                    </Cell>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )}
      </div>
    </ConsoleShell>
  );
}
