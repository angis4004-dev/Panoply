import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { SupportTicketModel, ticketReference } from '@/lib/models/SupportTicket';
import type { ISupportTicket } from '@/lib/models/SupportTicket';
import { createNotification } from '@/lib/notifications';

/**
 * Support tickets: raising one, and answering it.
 *
 * The write path lives here rather than in the route so that the two things
 * that must always happen together - the reply row and the notification that
 * delivers it - cannot drift apart as either surface changes.
 */

/**
 * Three new tickets an hour, per account.
 *
 * High enough that nobody with a genuine problem will meet it: a real user
 * files one ticket and waits. Low enough that a script cannot fill the queue
 * faster than a person can read it, which is the actual failure mode - the
 * cost of spam here is not storage, it is an operator losing the one ticket
 * that mattered in a page of noise.
 */
export const TICKET_RATE_LIMIT = 3;
export const TICKET_RATE_WINDOW_MS = 60 * 60 * 1000;

export function ticketRateLimitKey(userId: string): string {
  return `support:ticket:${userId}`;
}

export interface CreateTicketInput {
  userId: string;
  userEmail: string;
  userName: string;
  subject: string;
  body: string;
  pathname?: string;
  lastQuestion?: string;
}

export interface CreatedTicket {
  id: string;
  reference: string;
}

export async function createSupportTicket(input: CreateTicketInput): Promise<CreatedTicket | null> {
  const connection = await connectToDatabase();
  if (!connection) return null;

  const ticket = await SupportTicketModel.create({
    userId: new mongoose.Types.ObjectId(input.userId),
    userEmail: input.userEmail,
    userName: input.userName,
    subject: input.subject,
    body: input.body,
    status: 'open',
    context: {
      // Stored only when it is one of our own paths. The client supplies this
      // and there is no reason for it to ever be anything else, but an
      // operator reads this field and a fabricated absolute URL sitting in a
      // console table is a link waiting to be clicked.
      pathname: input.pathname?.startsWith('/') ? input.pathname.slice(0, 200) : '',
      lastQuestion: input.lastQuestion?.slice(0, 2000) ?? '',
    },
  });

  const id = String(ticket._id);
  return { id, reference: ticketReference(id) };
}

export interface ReplyInput {
  ticketId: string;
  body: string;
  adminId: string;
  adminEmail: string;
  /** Close the ticket in the same action, for answers that end the matter. */
  close?: boolean;
}

export type ReplyOutcome =
  | { ok: true; ticket: ISupportTicket }
  | { ok: false; reason: 'unavailable' | 'not_found' | 'closed' };

/**
 * Answer a ticket.
 *
 * The reply and the notification are two writes and the second is allowed to
 * fail quietly - createNotification never throws - because an answer that was
 * recorded but not announced is recoverable by looking at the ticket, whereas
 * a 500 here would tell the operator their answer was lost when it was not.
 * The trade-off the rest of the codebase makes for the same reason.
 */
export async function replyToSupportTicket(input: ReplyInput): Promise<ReplyOutcome> {
  const connection = await connectToDatabase();
  if (!connection) return { ok: false, reason: 'unavailable' };
  if (!mongoose.Types.ObjectId.isValid(input.ticketId)) {
    return { ok: false, reason: 'not_found' };
  }

  const ticket = await SupportTicketModel.findById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (ticket.status === 'closed') return { ok: false, reason: 'closed' };

  const now = new Date();
  ticket.replies.push({
    body: input.body,
    adminId: new mongoose.Types.ObjectId(input.adminId),
    adminEmail: input.adminEmail,
    createdAt: now,
  });
  ticket.firstRepliedAt = ticket.firstRepliedAt ?? now;
  ticket.status = input.close ? 'closed' : 'answered';
  if (input.close) ticket.closedAt = now;
  await ticket.save();

  const reference = ticketReference(String(ticket._id));

  /*
   * The reply travels in the notification body, not behind a link to a thread
   * page that does not exist. The user reads the answer in the bell they
   * already check, which is the whole delivery mechanism - so the body must
   * be the answer itself and not a summary of it.
   *
   * No href for the same reason: a link to nowhere is worse than no link.
   */
  await createNotification({
    userId: String(ticket.userId),
    type: 'system',
    title: `Support replied — ${reference}`,
    body: input.body,
  });

  return { ok: true, ticket };
}

export interface CloseInput {
  ticketId: string;
}

export type CloseOutcome = { ok: true } | { ok: false; reason: 'unavailable' | 'not_found' };

/** Close without answering: duplicates, and tickets resolved another way. */
export async function closeSupportTicket(input: CloseInput): Promise<CloseOutcome> {
  const connection = await connectToDatabase();
  if (!connection) return { ok: false, reason: 'unavailable' };
  if (!mongoose.Types.ObjectId.isValid(input.ticketId)) {
    return { ok: false, reason: 'not_found' };
  }

  const ticket = await SupportTicketModel.findById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };

  // Closing an already-closed ticket succeeds and changes nothing. It is the
  // desired end state either way, and closedAt must keep naming the moment it
  // was first closed rather than the last time somebody clicked the button.
  if (ticket.status !== 'closed') {
    ticket.status = 'closed';
    ticket.closedAt = new Date();
    await ticket.save();
  }

  return { ok: true };
}
