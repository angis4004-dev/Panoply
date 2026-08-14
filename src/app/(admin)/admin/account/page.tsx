import React from 'react';
import { requireAdminPageForSetup } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { AdminSessionModel } from '@/lib/models/AdminSession';
import { effectivePermissions } from '@/lib/admin/permissions';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import { Badge, Card, Cell, Empty, Note, Table, when } from '@/components/admin-console/primitives';
import { RoleBadge, ROLE_SUMMARY } from '@/components/admin-console/role-badge';
import { ChangePassword } from './change-password';

export const dynamic = 'force-dynamic';

/**
 * The permissions worth picking out of the list.
 *
 * Each of these either moves a trader's money or changes who is allowed to.
 * They are the ones an operator should be able to confirm at a glance, and the
 * ones a reviewer asks about first.
 */
const MONEY_PERMISSIONS = new Set([
  'deposit.authorize',
  'ledger.adjust',
  'deposit_address.manage',
  'admin.create',
  'admin.manage',
]);

/**
 * The admin's own account.
 *
 * Uses requireAdminPageForSetup rather than requireAdminPage: this is the one
 * page an account with a provisional password may reach, because it is where
 * that gets fixed. Every other page redirects here until it is.
 */
export default async function AdminAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const ctx = await requireAdminPageForSetup();
  const { setup } = await searchParams;
  const permissions = effectivePermissions(ctx.admin);

  const connection = await connectToDatabase();
  const now = new Date();
  const sessions = connection
    ? await AdminSessionModel.find({
        adminId: ctx.admin.id,
        revokedAt: null,
        expiresAt: { $gt: now },
        idleExpiresAt: { $gt: now },
      })
        .sort({ createdAt: -1 })
        .lean()
    : [];

  return (
    <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/account">
      <PageHeading
        title="Your account"
        description={ctx.admin.email}
        actions={<RoleBadge role={ctx.admin.role} />}
      />

      {setup && ctx.admin.mustChangePassword && (
        <Note tone="warning" className="mb-5 text-ds-label">
          Your password was issued to you by someone else. Choose your own before using the console
          — nothing else is reachable until you do.
        </Note>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Password" description="Changing it ends every other session you have open.">
          <ChangePassword />
        </Card>

        <Card
          title="What you can do"
          description={`${permissions.length} permission${permissions.length === 1 ? '' : 's'} in effect right now.`}
        >
          <p className="mb-3 text-ds-caption font-normal leading-relaxed tracking-normal text-ds-text-muted">
            {ROLE_SUMMARY[ctx.admin.role]}
          </p>
          <div className="flex flex-wrap gap-1">
            {permissions.map((permission) => (
              <Badge
                key={permission}
                tone={MONEY_PERMISSIONS.has(permission) ? 'brand' : 'neutral'}
                className="font-mono"
              >
                {permission}
              </Badge>
            ))}
          </div>
          {/* The money-moving ones are marked. A flat list of seventeen
              monospace strings hides the four that matter. */}
          <p className="mt-3 text-ds-caption font-normal tracking-normal text-ds-text-muted">
            Highlighted permissions move money or change who can.
          </p>
        </Card>

        <Card
          title="Open sessions"
          description="Every device currently signed in as you."
          className="lg:col-span-2"
        >
          {sessions.length === 0 ? (
            <Empty>No open sessions recorded.</Empty>
          ) : (
            <Table head={['Signed in', 'Last seen', 'Expires', 'IP', 'Device']}>
              {sessions.map((session) => (
                <tr key={String(session._id)}>
                  <Cell mono>{when(session.createdAt)}</Cell>
                  <Cell mono>{when(session.lastSeenAt)}</Cell>
                  <Cell mono>{when(session.expiresAt)}</Cell>
                  <Cell mono className="text-ds-caption">
                    {session.ip || '—'}
                  </Cell>
                  <Cell className="max-w-md truncate text-ds-caption text-ds-text-muted">
                    {session.userAgent || '—'}
                    {String(session._id) === ctx.sessionId ? (
                      <span className="ml-2">
                        <Badge tone="info">this device</Badge>
                      </span>
                    ) : null}
                  </Cell>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </ConsoleShell>
  );
}
