import React from 'react';
import { requireAdminPage } from '@/lib/admin/page-guard';
import { connectToDatabase } from '@/lib/mongo';
import { SupportTicketModel, ticketReference } from '@/lib/models/SupportTicket';
import { ConsoleShell, PageHeading } from '@/components/admin-console/shell';
import { Badge, Card, Cell, Empty, Table, when } from '@/components/admin-console/primitives';
import { TicketReply } from './reply';

export const dynamic = 'force-dynamic';

const TABS = ['open', 'answered', 'closed'] as const;

/**
 * The support queue.
 *
 * Oldest first, and that is the one deliberate choice on this page. Every
 * other queue in the console sorts newest first because the newest deposit is
 * the one an operator is waiting on. Support runs the other way: the ticket at
 * the top should be the person who has been waiting longest, or the queue
 * quietly abandons them every time it gets busy.
 */
export default async function SupportQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireAdminPage('support.read');
  const { status = 'open' } = await searchParams;
  const canReply = ctx.can('support.reply');

  const connection = await connectToDatabase();
  if (!connection) {
    return (
      <ConsoleShell admin={ctx.admin} can={ctx.can} current="/admin/support">
        <Card title="Database unavailable">
          <p className="text-ds-label text-ds-text-muted">The console cannot reach the database.</p>
        </Card>
      </ConsoleShell>
    );
  }

  // Narrowed against the tab list rather than passed through: a query string
  // is user input even on an authenticated page.
  const view = (TABS as readonly string[]).includes(status)
    ? (status as (typeof TABS)[number])
    : 'open';

  const [rows, openCount] = await Promise.all([
    SupportTicketModel.find({ status: view }).sort({ createdAt: 1 }).limit(150).lean(),
    SupportTicketModel.countDocuments({ status: 'open' }),
  ]);

  return (
    <ConsoleShell
      admin={ctx.admin}
      can={ctx.can}
      current="/admin/support"
      pendingBadges={{ '/admin/support': openCount }}
    >
      <PageHeading
        title="Support"
        description="Questions Ask Panoply could not answer. Your reply reaches the trader in their notifications, so write it as the whole answer rather than a pointer to one."
      />

      <nav className="mb-4 flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <a
            key={tab}
            href={`/admin/support?status=${tab}`}
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

      {!canReply && (
        <p className="mb-4 rounded border border-ds-border bg-ds-surface-raised/60 px-3 py-2 text-ds-caption text-ds-text-muted">
          Answering a ticket requires the <span className="font-mono">support.reply</span>{' '}
          permission.
        </p>
      )}

      <Card>
        {rows.length === 0 ? (
          <Empty>
            {view === 'open' ? 'Nothing waiting. The queue is clear.' : 'Nothing in this view.'}
          </Empty>
        ) : (
          <Table head={['Raised', 'Ref', 'Trader', 'Question', 'Status', '']}>
            {rows.map((row) => {
              const id = String(row._id);
              return (
                <tr key={id}>
                  <Cell mono>{when(row.createdAt)}</Cell>
                  <Cell mono>{ticketReference(id)}</Cell>
                  <Cell>
                    <div className="text-ds-text">{row.userName || '—'}</div>
                    <div className="text-ds-caption text-ds-text-muted">{row.userEmail}</div>
                  </Cell>
                  <Cell>
                    <div className="max-w-md">
                      <div className="font-medium text-ds-text">{row.subject}</div>
                      <p className="mt-0.5 whitespace-pre-wrap text-ds-caption text-ds-text-secondary">
                        {row.body}
                      </p>

                      {/* Where they were and what they had just asked the
                          assistant. Both are what turn "it isn't working"
                          into something answerable. */}
                      {(row.context?.pathname || row.context?.lastQuestion) && (
                        <dl className="mt-1.5 space-y-0.5 text-ds-caption text-ds-text-muted">
                          {row.context?.pathname ? (
                            <div>
                              <dt className="inline">Raised from: </dt>
                              <dd className="inline font-mono">{row.context.pathname}</dd>
                            </div>
                          ) : null}
                          {row.context?.lastQuestion ? (
                            <div>
                              <dt className="inline">Asked the assistant: </dt>
                              <dd className="inline italic">
                                &ldquo;{row.context.lastQuestion}&rdquo;
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      )}

                      {row.replies?.length > 0 && (
                        <ol className="mt-2 space-y-1.5 border-l-2 border-ds-border pl-2.5">
                          {row.replies.map((reply, i) => (
                            <li key={i} className="text-ds-caption">
                              <div className="text-ds-text-muted">
                                {reply.adminEmail} · {when(reply.createdAt)}
                              </div>
                              <p className="whitespace-pre-wrap text-ds-text-secondary">
                                {reply.body}
                              </p>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </Cell>
                  <Cell>
                    <Badge
                      tone={
                        row.status === 'open'
                          ? 'warning'
                          : row.status === 'answered'
                            ? 'positive'
                            : 'neutral'
                      }
                    >
                      {row.status}
                    </Badge>
                  </Cell>
                  <Cell>
                    {canReply && row.status !== 'closed' ? (
                      <TicketReply ticketId={id} reference={ticketReference(id)} />
                    ) : (
                      <span className="text-ds-caption text-ds-text-muted">—</span>
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
