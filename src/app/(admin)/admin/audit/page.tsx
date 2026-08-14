import React from 'react';
import Link from 'next/link';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { AdminUserModel } from '@/lib/models/AdminUser';
import { objectId } from '@/lib/validation';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import { Card, Cell, Empty, Table, shortHash, when } from '@/components/admin-console/primitives';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;

const TARGET_TYPES = [
  'user',
  'admin',
  'kyc',
  'deposit',
  'deposit_address',
  'session',
  'bot',
  'model',
];

/**
 * The audit log.
 *
 * Read-only, and not by convention: the collection refuses updates and deletes
 * at the schema level and there is no write path on this page. An operations
 * console that can edit its own audit trail is not one.
 *
 * Filters are limited to indexed fields. Free-text search over an append-only
 * collection that grows forever is a query that works in development and times
 * out in production.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    actor?: string;
    trader?: string;
    action?: string;
    targetType?: string;
    reference?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const ctx = await requireAdminPage('audit.read');
  const filters = await searchParams;
  const page = Math.max(1, Number(filters.page ?? 1) || 1);

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/audit">
        <Card title="Database unavailable">
          <p className="text-ds-label text-ds-text-muted">The console cannot reach the database.</p>
        </Card>
      </ConsoleShell>
    );
  }

  const query: Record<string, unknown> = {};
  if (filters.actor && objectId.safeParse(filters.actor).success) {
    query.actorAdminId = filters.actor;
  }
  if (filters.trader && objectId.safeParse(filters.trader).success) {
    query.affectedUserId = filters.trader;
  }
  if (filters.targetType && TARGET_TYPES.includes(filters.targetType)) {
    query.targetType = filters.targetType;
  }
  if (filters.reference?.trim()) query.reference = filters.reference.trim();
  if (filters.action?.trim()) {
    const value = filters.action.trim();
    // Anchored prefix match, so 'deposit' selects the whole family without
    // becoming an unanchored scan.
    query.action = value.includes('.')
      ? value
      : new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`);
  }

  const range: Record<string, Date> = {};
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  // A date-only 'to' means the end of that day, not midnight at its start -
  // otherwise filtering to today returns nothing, which reads as a broken
  // filter rather than an off-by-one.
  if (to && !Number.isNaN(to.getTime())) {
    range.$lte = /^\d{4}-\d{2}-\d{2}$/.test(filters.to ?? '')
      ? new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1)
      : to;
  }
  if (Object.keys(range).length) query.createdAt = range;

  const [rows, total, actors] = await Promise.all([
    AdminAuditLogModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    AdminAuditLogModel.countDocuments(query),
    AdminUserModel.find({}).select('name email').lean(),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const carry = new URLSearchParams(
    Object.entries(filters).filter(([key, value]) => key !== 'page' && value) as [string, string][]
  ).toString();

  return (
    <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/audit">
      <PageHeading
        title="Audit log"
        description={`${total.toLocaleString()} recorded action${total === 1 ? '' : 's'}. Append-only.`}
      />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="text-ds-caption text-ds-text-muted">
            Admin
            <select
              name="actor"
              defaultValue={filters.actor ?? ''}
              className="mt-0.5 block rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-label text-ds-text"
            >
              <option value="">Any</option>
              {actors.map((actor) => (
                <option key={String(actor._id)} value={String(actor._id)}>
                  {actor.email}
                </option>
              ))}
            </select>
          </label>
          <label className="text-ds-caption text-ds-text-muted">
            Action
            <input
              name="action"
              defaultValue={filters.action ?? ''}
              placeholder="deposit or deposit.approve"
              className="mt-0.5 block w-48 rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-label text-ds-text"
            />
          </label>
          <label className="text-ds-caption text-ds-text-muted">
            Target
            <select
              name="targetType"
              defaultValue={filters.targetType ?? ''}
              className="mt-0.5 block rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-label text-ds-text"
            >
              <option value="">Any</option>
              {TARGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="text-ds-caption text-ds-text-muted">
            Reference
            <input
              name="reference"
              defaultValue={filters.reference ?? ''}
              placeholder="tx hash"
              className="mt-0.5 block w-44 rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 font-mono text-ds-caption text-ds-text"
            />
          </label>
          <label className="text-ds-caption text-ds-text-muted">
            From
            <input
              type="date"
              name="from"
              defaultValue={filters.from ?? ''}
              className="mt-0.5 block rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-label text-ds-text"
            />
          </label>
          <label className="text-ds-caption text-ds-text-muted">
            To
            <input
              type="date"
              name="to"
              defaultValue={filters.to ?? ''}
              className="mt-0.5 block rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-label text-ds-text"
            />
          </label>
          {filters.trader && <input type="hidden" name="trader" value={filters.trader} />}
          <button
            type="submit"
            className="rounded bg-ds-surface-inset px-3 py-1.5 text-ds-label text-ds-text hover:bg-ds-surface-overlay"
          >
            Apply
          </button>
          <Link
            href="/admin/audit"
            className="px-2 py-1.5 text-ds-label text-ds-text-muted hover:underline"
          >
            Clear
          </Link>
        </form>
      </Card>

      <Card>
        {rows.length === 0 ? (
          <Empty>Nothing matches these filters.</Empty>
        ) : (
          <Table
            head={['When', 'Admin', 'Action', 'Target', 'Change', 'Reason', 'Reference', 'IP']}
          >
            {rows.map((entry) => (
              <tr key={String(entry._id)}>
                <Cell mono className="whitespace-nowrap">
                  {when(entry.createdAt)}
                </Cell>
                <Cell className="text-ds-caption">
                  {entry.actorEmail}
                  {entry.actorRole ? (
                    <div className="text-ds-text-muted">{entry.actorRole}</div>
                  ) : null}
                </Cell>
                <Cell mono className="whitespace-nowrap">
                  {entry.action}
                </Cell>
                <Cell className="text-ds-caption">
                  <div className="font-mono text-ds-text-muted">{entry.targetType}</div>
                  {entry.affectedUserId ? (
                    <Link
                      href={`/admin/traders/${String(entry.affectedUserId)}`}
                      className="text-primary hover:underline"
                    >
                      trader
                    </Link>
                  ) : null}
                </Cell>
                <Cell className="max-w-xs">
                  <Change before={entry.before} after={entry.after} />
                </Cell>
                <Cell className="max-w-xs text-ds-caption text-ds-text-muted">
                  {entry.reason || '—'}
                </Cell>
                <Cell mono className="text-ds-caption" title={entry.reference || undefined}>
                  {entry.reference ? shortHash(entry.reference, 8, 6) : '—'}
                </Cell>
                <Cell mono className="text-ds-caption text-ds-text-muted">
                  {entry.ip || '—'}
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
              href={`/admin/audit?${carry}&page=${page - 1}`}
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
              href={`/admin/audit?${carry}&page=${page + 1}`}
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

/**
 * Renders the before/after diff.
 *
 * The stored pair only ever contains fields that actually changed, so this can
 * print all of them without turning each row into a wall of unchanged values.
 */
function Change({
  before,
  after,
}: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  const keys = Object.keys(after ?? {});
  if (keys.length === 0) return <span className="text-ds-caption text-ds-text-muted">—</span>;

  return (
    <ul className="space-y-0.5 text-ds-caption">
      {keys.map((key) => (
        <li key={key} className="font-mono">
          <span className="text-ds-text-muted">{key}: </span>
          <span className="text-ds-value-negative/80">{format(before?.[key])}</span>
          <span className="text-ds-text-muted"> → </span>
          <span className="text-ds-value-positive">{format(after[key])}</span>
        </li>
      ))}
    </ul>
  );
}

function format(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'string') return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  return JSON.stringify(value);
}
