import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { DepositModel } from '@/lib/models/Deposit';
import { DepositAddressModel } from '@/lib/models/DepositAddress';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { AdminUserModel } from '@/lib/models/AdminUser';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import {
  Card,
  Cell,
  Empty,
  Note,
  Row,
  Stat,
  Table,
  when,
} from '@/components/admin-console/primitives';
import { RoleBadge, ROLE_SUMMARY } from '@/components/admin-console/role-badge';

export const dynamic = 'force-dynamic';

/**
 * The console's landing screen.
 *
 * Reads the database directly rather than calling its own API over HTTP. A
 * server component fetching from a route handler on the same server pays for
 * a second request and has to forward the session cookie by hand; the guard
 * has already resolved the session, and the permission checks below are the
 * same ones the API applies.
 */
export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const ctx = await requireAdminPage();
  const { denied } = await searchParams;

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin">
        <Card title="Database unavailable">
          <p className="text-ds-label font-normal tracking-normal text-ds-text-muted">
            The console cannot reach the database. Nothing below is current.
          </p>
        </Card>
      </ConsoleShell>
    );
  }

  const canReadAudit = ctx.can('audit.read');

  const [
    totalTraders,
    activeTraders,
    pendingKyc,
    assignedAddresses,
    pendingDeposits,
    admins,
    recent,
  ] = await Promise.all([
    UserModel.countDocuments({ role: 'Trader' }),
    UserModel.countDocuments({ role: 'Trader', status: 'active' }),
    UserModel.countDocuments({ kycStatus: 'pending' }),
    DepositAddressModel.countDocuments({ status: 'active' }),
    DepositModel.countDocuments({ status: 'pending' }),
    AdminUserModel.countDocuments({ status: 'active' }),
    canReadAudit
      ? AdminAuditLogModel.find({})
          .sort({ createdAt: -1 })
          .limit(12)
          .select('actorEmail actorRole action targetType targetId reason createdAt')
          .lean()
      : Promise.resolve([]),
  ]);

  const firstName = ctx.admin.name.split(' ')[0];

  return (
    <ConsoleShell
      admin={ctx.admin}
      can={ctx.can}
      current="/admin"
      pendingBadges={{ '/admin/deposits': pendingDeposits, '/admin/kyc': pendingKyc }}
    >
      {/* No role chip here: the shell carries one permanently, and repeating
          it in the page heading reads as two different facts on mobile, where
          they end up a centimetre apart. */}
      <PageHeading
        title={`Good to see you, ${firstName}`}
        description="Everything waiting on an operator, and what has been done recently."
      />

      {denied && (
        <Note tone="warning" className="mb-5 flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            You do not hold the <span className="font-mono">{denied}</span> permission. Ask the
            MainAdmin if you need it.
          </span>
        </Note>
      )}

      {/* Queues first, and marked. These two are the reason anyone opens the
          console; everything below is context. */}
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <QueueCard
          href="/admin/deposits"
          label="Deposits awaiting authorization"
          count={pendingDeposits}
          clear="Queue is clear"
          waiting="Oldest first"
          visible={ctx.can('deposit.read')}
        />
        <QueueCard
          href="/admin/kyc"
          label="KYC awaiting review"
          count={pendingKyc}
          clear="Queue is clear"
          waiting="Applicants are waiting"
          visible={ctx.can('kyc.read')}
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total traders" value={totalTraders.toLocaleString()} />
        <Stat label="Active traders" value={activeTraders.toLocaleString()} />
        <Stat label="Active addresses" value={assignedAddresses.toLocaleString()} />
        <Stat label="Active admins" value={admins.toLocaleString()} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr,1fr]">
        <Card
          title="Recent admin activity"
          description={
            canReadAudit
              ? 'The last twelve recorded actions.'
              : 'Requires the audit.read permission.'
          }
          actions={
            canReadAudit ? (
              <Link
                href="/admin/audit"
                className="inline-flex items-center gap-1 rounded text-ds-caption font-medium text-primary transition-colors duration-fast ease-ds-out hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                Full audit log
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            ) : null
          }
        >
          {recent.length === 0 ? (
            <Empty>{canReadAudit ? 'Nothing recorded yet.' : 'Not available to your role.'}</Empty>
          ) : (
            <Table head={['When', 'Admin', 'Action', 'Target', 'Reason']}>
              {recent.map((entry) => (
                <Row key={String(entry._id)}>
                  <Cell mono className="whitespace-nowrap">
                    {when(entry.createdAt)}
                  </Cell>
                  <Cell>
                    <span className="text-ds-text">{entry.actorEmail}</span>
                    {entry.actorRole ? (
                      <span className="ml-1.5 text-ds-caption text-ds-text-muted">
                        {entry.actorRole}
                      </span>
                    ) : null}
                  </Cell>
                  <Cell mono className="text-primary/80">
                    {entry.action}
                  </Cell>
                  <Cell mono>{entry.targetType}</Cell>
                  <Cell className="max-w-md text-ds-text-muted">{entry.reason || '—'}</Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>

        {/* The hierarchy, stated on the screen everyone lands on. Operators
            ask "why can't I do X" far more often than they read a permission
            list, and the answer is nearly always this. */}
        <Card title="Your authority" description={`Signed in as ${ctx.admin.role}.`}>
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/25 bg-primary/[0.05] p-3">
              <RoleBadge role="MainAdmin" />
              <p className="mt-2 text-ds-caption font-normal leading-relaxed tracking-normal text-ds-text-secondary">
                {ROLE_SUMMARY.MainAdmin}
              </p>
            </div>
            <div className="rounded-lg border border-ds-border bg-ds-surface-inset/50 p-3">
              <RoleBadge role="Admin" />
              <p className="mt-2 text-ds-caption font-normal leading-relaxed tracking-normal text-ds-text-secondary">
                {ROLE_SUMMARY.Admin}
              </p>
            </div>
            <Link
              href="/admin/account"
              className="inline-flex items-center gap-1 rounded text-ds-caption font-medium text-primary transition-colors duration-fast ease-ds-out hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              See exactly what you hold
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </Card>
      </div>
    </ConsoleShell>
  );
}

/**
 * A queue tile that is a link when there is work and a flat statement when
 * there is not. A zero that is still clickable invites a pointless trip.
 */
function QueueCard({
  href,
  label,
  count,
  clear,
  waiting,
  visible,
}: {
  href: string;
  label: string;
  count: number;
  clear: string;
  waiting: string;
  visible: boolean;
}) {
  if (!visible) return null;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ds-caption uppercase text-ds-text-muted">{label}</span>
        {count > 0 && (
          <ArrowRight
            className="h-3.5 w-3.5 shrink-0 text-primary transition-transform duration-fast ease-ds-out group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        )}
      </div>
      <div
        className={`mt-1 font-mono text-ds-display tabular-nums ${
          count > 0 ? 'text-primary' : 'text-ds-text-muted'
        }`}
      >
        {count}
      </div>
      <div className="text-ds-caption font-normal tracking-normal text-ds-text-muted">
        {count > 0 ? waiting : clear}
      </div>
    </>
  );

  if (count === 0) {
    return (
      <div className="rounded-ds-md border border-ds-border bg-ds-surface-raised/60 px-4 py-3">
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group rounded-ds-md border border-primary/30 bg-primary/[0.06] px-4 py-3 transition-colors duration-fast ease-ds-out hover:border-primary/50 hover:bg-primary/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
    >
      {body}
    </Link>
  );
}
