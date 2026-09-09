import { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { objectId, parseBody } from '@/lib/validation';
import { closeSupportTicket, replyToSupportTicket } from '@/lib/support';
import { ticketReference } from '@/lib/models/SupportTicket';

/**
 * PATCH /api/admin/support/[id] — answer a ticket, or close it unanswered.
 *
 * Two actions rather than two routes, because they are one decision made at
 * one screen: the operator reads the ticket and either has something to say or
 * does not.
 */

const decisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('reply'),
    body: z.string().trim().min(2).max(4000),
    /** Answer and close in one step, for questions that end the matter. */
    close: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('close'),
    /** Why it was closed without an answer: duplicate, spam, handled elsewhere. */
    reason: z.string().trim().max(280).optional(),
  }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'support.reply');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid ticket id' }, { status: 400 });
  }

  const { data: body, error: invalid } = await parseBody(request, decisionSchema);
  if (invalid) return invalid;

  if (body.action === 'close') {
    const outcome = await closeSupportTicket({ ticketId: id });
    if (!outcome.ok) {
      return outcome.reason === 'unavailable'
        ? adminJson({ error: 'Database connection unavailable' }, { status: 503 })
        : adminJson({ error: 'Ticket not found' }, { status: 404 });
    }

    await recordAdminAction(ctx, {
      action: 'support.close',
      targetType: 'support_ticket',
      targetId: id,
      after: { status: 'closed' },
      reason: body.reason ?? 'Closed without a reply.',
    });

    return adminJson({ status: 'closed' });
  }

  const outcome = await replyToSupportTicket({
    ticketId: id,
    body: body.body,
    adminId: ctx.admin.id,
    adminEmail: ctx.admin.email,
    close: body.close,
  });

  if (!outcome.ok) {
    if (outcome.reason === 'unavailable') {
      return adminJson({ error: 'Database connection unavailable' }, { status: 503 });
    }
    if (outcome.reason === 'closed') {
      return adminJson({ error: 'This ticket is closed. Reopen it to reply.' }, { status: 409 });
    }
    return adminJson({ error: 'Ticket not found' }, { status: 404 });
  }

  /*
   * The reply text is not written to the audit log.
   *
   * The trail answers "who exercised authority over this account", and the
   * fact that an operator answered a ticket at a time is that answer. The
   * words are on the ticket, which is where an operator reviewing the
   * exchange will read them - copying them into a second collection would
   * duplicate whatever a user disclosed in their question's context into a
   * record with different access rules.
   */
  await recordAdminAction(ctx, {
    action: 'support.reply',
    targetType: 'support_ticket',
    targetId: id,
    affectedUserId: String(outcome.ticket.userId),
    after: { status: outcome.ticket.status, replies: outcome.ticket.replies.length },
    reference: ticketReference(id),
  });

  return adminJson({ status: outcome.ticket.status });
}
