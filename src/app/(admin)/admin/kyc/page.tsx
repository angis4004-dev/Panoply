import React from 'react';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { maskFromLastFour } from '@/lib/pii-crypto';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import {
  Badge,
  Card,
  Cell,
  Empty,
  Table,
  statusTone,
  when,
} from '@/components/admin-console/primitives';
import { KycReview } from './review';

export const dynamic = 'force-dynamic';

const TABS = ['pending', 'verified', 'rejected'] as const;

/**
 * The KYC queue.
 *
 * Identity numbers are masked in this list. Seeing the real one, and opening
 * the document, happens one applicant at a time through the review control -
 * and both are recorded in the audit log, because reading someone's passport
 * is an action rather than a page view.
 */
export default async function KycQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireAdminPage('kyc.read');
  const { status = 'pending' } = await searchParams;
  const canReview = ctx.can('kyc.review');

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/kyc">
        <Card title="Database unavailable">
          <p className="text-ds-label text-ds-text-muted">The console cannot reach the database.</p>
        </Card>
      </ConsoleShell>
    );
  }

  // Narrowed against the tab list rather than passed through. A query string
  // is user input even on an authenticated page.
  const view = (TABS as readonly string[]).includes(status)
    ? (status as (typeof TABS)[number])
    : 'pending';

  const [rows, pendingCount] = await Promise.all([
    UserModel.find(
      { kycStatus: view },
      {
        name: 1,
        email: 1,
        kycStatus: 1,
        kycSubmittedAt: 1,
        kycFullName: 1,
        kycCountry: 1,
        kycIdType: 1,
        kycIdNumberLast4: 1,
        kycDocumentProvided: 1,
        kycRejectionReason: 1,
      }
    )
      .sort({ kycSubmittedAt: -1 })
      .limit(150)
      .lean(),
    UserModel.countDocuments({ kycStatus: 'pending' }),
  ]);

  return (
    <ConsoleShell
      admin={ctx.admin}
      can={ctx.can}
      current="/admin/kyc"
      pendingBadges={{ '/admin/kyc': pendingCount }}
    >
      <PageHeading
        title="Identity verification"
        description="Approving unlocks deposits for the applicant, so a document must be on file before it is possible."
      />

      <nav className="mb-4 flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <a
            key={tab}
            href={`/admin/kyc?status=${tab}`}
            className={`rounded px-2.5 py-1.5 text-ds-label capitalize ${
              view === tab
                ? 'bg-ds-surface-inset text-ds-text'
                : 'text-ds-text-muted hover:bg-ds-surface-inset/60 hover:text-ds-text'
            }`}
          >
            {tab}
          </a>
        ))}
      </nav>

      {!canReview && (
        <p className="mb-4 rounded border border-ds-border bg-ds-surface-raised/60 px-3 py-2 text-ds-caption text-ds-text-muted">
          Deciding on a submission requires the <span className="font-mono">kyc.review</span>{' '}
          permission.
        </p>
      )}

      <Card>
        {rows.length === 0 ? (
          <Empty>Nothing in this view.</Empty>
        ) : (
          <Table
            head={[
              'Submitted',
              'Applicant',
              'Declared name',
              'Country',
              'ID',
              'Document',
              'Status',
              '',
            ]}
          >
            {rows.map((row) => (
              <tr key={String(row._id)}>
                <Cell mono>{when(row.kycSubmittedAt)}</Cell>
                <Cell>
                  <div className="text-ds-text">{row.name}</div>
                  <div className="text-ds-caption text-ds-text-muted">{row.email}</div>
                </Cell>
                <Cell>{row.kycFullName || '—'}</Cell>
                <Cell>{row.kycCountry || '—'}</Cell>
                <Cell mono>
                  <div>{row.kycIdType || '—'}</div>
                  <div className="text-ds-text-muted">{maskFromLastFour(row.kycIdNumberLast4)}</div>
                </Cell>
                <Cell>
                  {row.kycDocumentProvided ? (
                    <Badge tone="positive">on file</Badge>
                  ) : (
                    <Badge tone="warning">missing</Badge>
                  )}
                </Cell>
                <Cell>
                  <Badge tone={statusTone(row.kycStatus ?? 'unverified')}>
                    {row.kycStatus ?? 'unverified'}
                  </Badge>
                  {row.kycRejectionReason ? (
                    <div className="mt-1 max-w-xs text-ds-caption text-ds-text-muted">
                      {row.kycRejectionReason}
                    </div>
                  ) : null}
                </Cell>
                <Cell>
                  {canReview && row.kycStatus === 'pending' ? (
                    <KycReview
                      userId={String(row._id)}
                      documentProvided={Boolean(row.kycDocumentProvided)}
                    />
                  ) : (
                    <span className="text-ds-caption text-ds-text-muted">—</span>
                  )}
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </ConsoleShell>
  );
}
