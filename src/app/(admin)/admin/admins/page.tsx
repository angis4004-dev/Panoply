import React from 'react';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { AdminUserModel } from '@/lib/models/AdminUser';
import { AdminSessionModel } from '@/lib/models/AdminSession';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import {
  ADMIN_DEFAULT_PERMISSIONS,
  effectivePermissions,
  grantablePermissions,
} from '@/lib/admin/permissions';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import { RoleBadge, ROLE_SUMMARY } from '@/components/admin-console/role-badge';
import {
  Badge,
  Card,
  Cell,
  Empty,
  Table,
  statusTone,
  when,
} from '@/components/admin-console/primitives';
import { CreateAdmin } from './create-admin';
import { AdminControls } from './controls';

export const dynamic = 'force-dynamic';

/**
 * The admin roster.
 *
 * Reading it needs admin.read; changing anything on it needs admin.manage,
 * which only the MainAdmin holds and which cannot be delegated. The MainAdmin
 * row has no controls at all - there is no path through this console to alter
 * the account at the top of the hierarchy.
 */
export default async function AdminsPage() {
  const ctx = await requireAdminPage('admin.read');
  const canManage = ctx.can('admin.manage');
  const canCreate = ctx.can('admin.create');

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/admins">
        <Card title="Database unavailable">
          <p className="text-ds-label text-ds-text-muted">The console cannot reach the database.</p>
        </Card>
      </ConsoleShell>
    );
  }

  const now = new Date();
  const [admins, sessions, recentActivity] = await Promise.all([
    AdminUserModel.find({})
      .select(
        'name email role status grantedPermissions createdAt lastLoginAt lastLoginIp disabledAt disabledReason mustChangePassword mustSetPin'
      )
      .sort({ role: 1, createdAt: 1 })
      .lean(),
    AdminSessionModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { revokedAt: null, expiresAt: { $gt: now }, idleExpiresAt: { $gt: now } } },
      { $group: { _id: '$adminId', count: { $sum: 1 } } },
    ]),
    AdminAuditLogModel.find({ targetType: { $in: ['admin', 'session'] } })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean(),
  ]);

  const openSessions = new Map(sessions.map((row) => [String(row._id), row.count]));

  return (
    <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/admins">
      <PageHeading
        title="Admins"
        description="Two roles, and the difference between them is not a setting."
        actions={canCreate ? <CreateAdmin grantable={grantablePermissions()} /> : null}
      />

      {/* The hierarchy, spelled out where the decisions about it get made.
          Everything on this page is an application of these two paragraphs,
          and an operator reading a permission list without them will guess. */}
      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-ds-md border border-primary/25 bg-primary/[0.05] p-4">
          <RoleBadge role="MainAdmin" />
          <p className="mt-2 text-ds-label font-normal leading-relaxed tracking-normal text-ds-text-secondary">
            {ROLE_SUMMARY.MainAdmin}
          </p>
          <p className="mt-2 text-ds-caption font-normal leading-relaxed tracking-normal text-ds-text-muted">
            There is exactly one, enforced by a unique index rather than by convention. It cannot be
            created, edited, or suspended from this console — including by itself.
          </p>
        </div>
        <div className="rounded-ds-md border border-ds-border bg-ds-surface-raised/60 p-4">
          <RoleBadge role="Admin" />
          <p className="mt-2 text-ds-label font-normal leading-relaxed tracking-normal text-ds-text-secondary">
            {ROLE_SUMMARY.Admin}
          </p>
          <p className="mt-2 text-ds-caption font-normal leading-relaxed tracking-normal text-ds-text-muted">
            Grantable: <span className="font-mono">deposit.authorize</span>,{' '}
            <span className="font-mono">ledger.adjust</span>,{' '}
            <span className="font-mono">trader.create</span> and the rest. Never grantable:{' '}
            <span className="font-mono">admin.create</span>,{' '}
            <span className="font-mono">admin.manage</span>,{' '}
            <span className="font-mono">platform.manage</span>.
          </p>
        </div>
      </div>

      <Card className="mb-4">
        <Table head={['Admin', 'Role', 'Status', 'Permissions', 'Last sign-in', 'Sessions', '']}>
          {admins.map((admin) => {
            const id = String(admin._id);
            const effective = effectivePermissions({
              id,
              email: admin.email,
              role: admin.role,
              status: admin.status,
              grantedPermissions: admin.grantedPermissions ?? [],
            });
            const extras = (admin.grantedPermissions ?? []).filter(
              (permission) => !(ADMIN_DEFAULT_PERMISSIONS as readonly string[]).includes(permission)
            );

            return (
              <tr key={id}>
                <Cell>
                  <div className="text-ds-text">{admin.name}</div>
                  <div className="text-ds-caption text-ds-text-muted">{admin.email}</div>
                  {(admin.mustChangePassword || admin.mustSetPin) && (
                    <div className="mt-1">
                      <Badge tone="warning">setup pending</Badge>
                    </div>
                  )}
                </Cell>
                <Cell>
                  <RoleBadge role={admin.role} />
                </Cell>
                <Cell>
                  <Badge tone={statusTone(admin.status)}>{admin.status}</Badge>
                  {admin.disabledReason ? (
                    <div className="mt-1 max-w-[12rem] text-ds-caption text-ds-text-muted">
                      {admin.disabledReason}
                    </div>
                  ) : null}
                </Cell>
                <Cell className="max-w-xs text-ds-caption">
                  {admin.role === 'MainAdmin' ? (
                    <span className="text-ds-text-muted">all ({effective.length})</span>
                  ) : extras.length === 0 ? (
                    <span className="text-ds-text-muted">defaults only</span>
                  ) : (
                    <span className="font-mono text-ds-text-secondary">{extras.join(', ')}</span>
                  )}
                </Cell>
                <Cell mono className="text-ds-caption">
                  {when(admin.lastLoginAt)}
                  {admin.lastLoginIp ? (
                    <div className="text-ds-text-muted">{admin.lastLoginIp}</div>
                  ) : null}
                </Cell>
                <Cell mono>{openSessions.get(id) ?? 0}</Cell>
                <Cell>
                  {canManage && admin.role !== 'MainAdmin' && id !== ctx.admin.id ? (
                    <AdminControls
                      adminId={id}
                      status={admin.status}
                      granted={admin.grantedPermissions ?? []}
                      grantable={grantablePermissions()}
                    />
                  ) : (
                    <span className="text-ds-caption text-ds-text-muted">—</span>
                  )}
                </Cell>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Card
        title="Admin and session activity"
        description="Sign-ins, failures, and account changes."
      >
        {recentActivity.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <Table head={['When', 'Admin', 'Action', 'Reason', 'IP']}>
            {recentActivity.map((entry) => (
              <tr key={String(entry._id)}>
                <Cell mono>{when(entry.createdAt)}</Cell>
                <Cell className="text-ds-caption">{entry.actorEmail}</Cell>
                <Cell mono>{entry.action}</Cell>
                <Cell className="max-w-md text-ds-caption text-ds-text-muted">
                  {entry.reason || '—'}
                </Cell>
                <Cell mono className="text-ds-caption text-ds-text-muted">
                  {entry.ip || '—'}
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </ConsoleShell>
  );
}
