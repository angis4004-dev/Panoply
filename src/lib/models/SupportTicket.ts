import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A question the assistant could not answer, addressed to a person.
 *
 * Ask Panoply is grounded in the product documentation, which means there is a
 * hard edge to what it can know: it cannot see why a specific deposit is still
 * pending, it cannot decide anything, and it refuses to give advice. Before
 * this collection existed, reaching that edge was the end of the road - the
 * assistant said what it could not do and the user was left holding the
 * problem. This is the road continuing.
 *
 * Deliberately reachable by every tier, including unverified. The Copilot's
 * monthly allowance is zero until identity is verified, so for exactly the
 * users most likely to be stuck - part-way through verification, unable to
 * deposit, unsure why - this is not the fallback channel, it is the only one.
 * Gating it behind the same tier check would leave them with nothing.
 *
 * Not an email relay. A stored row is greppable, survives an inbox, and can be
 * counted; and the reply lands in the notification bell the user already
 * checks, rather than in a mailbox they signed up with months ago.
 */

export type SupportTicketStatus = 'open' | 'answered' | 'closed';

/** Where the user was, and what they were doing, when they gave up on the bot. */
export interface SupportTicketContext {
  /** In-app path the ticket was raised from, e.g. '/dashboard/withdraw'. */
  pathname?: string;
  /**
   * The last thing the user asked the assistant before escalating, when they
   * escalated from a conversation. This is the single most useful field an
   * operator can have: it says what the user actually wanted in their own
   * words, and whether the assistant misunderstood it or simply could not
   * help. Never the assistant's reply - that is reproducible from the
   * question, and storing generated text as though it were evidence invites
   * an operator to treat it as one.
   */
  lastQuestion?: string;
}

export interface ISupportTicketReply {
  body: string;
  adminId?: mongoose.Types.ObjectId | null;
  /** Denormalized so the thread stays attributable if the account is removed. */
  adminEmail: string;
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  userId: mongoose.Types.ObjectId;
  /** Denormalized: the queue is read far more often than it is written. */
  userEmail: string;
  userName: string;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  context: SupportTicketContext;
  replies: ISupportTicketReply[];
  /** Set on the first reply, so "time to first response" is one subtraction. */
  firstRepliedAt?: Date | null;
  closedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReplySchema = new Schema<ISupportTicketReply>(
  {
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    adminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    adminEmail: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userEmail: { type: String, required: true, trim: true, lowercase: true },
    userName: { type: String, default: '', trim: true },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    status: {
      type: String,
      enum: ['open', 'answered', 'closed'],
      default: 'open',
      index: true,
    },
    context: {
      pathname: { type: String, default: '' },
      lastQuestion: { type: String, default: '', maxlength: 2000 },
    },
    replies: { type: [ReplySchema], default: [] },
    firstRepliedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * The queue's only read: everything in one status, oldest first.
 *
 * Oldest first, not newest. A support queue worked newest-first starves the
 * person who has been waiting longest, which is precisely the person whose
 * ticket matters most. The index is ascending on createdAt to match.
 */
SupportTicketSchema.index({ status: 1, createdAt: 1 });

/**
 * A short, quotable handle for a ticket.
 *
 * Derived from the id rather than stored, so there is no second identifier to
 * keep unique and no window where a row exists without one. The tail of an
 * ObjectId is a per-process counter, so these do not collide in practice at
 * any volume this platform will see; it is a label for humans to read down a
 * phone line, and the id remains the key.
 */
export function ticketReference(id: mongoose.Types.ObjectId | string): string {
  return `PNP-${String(id).slice(-6).toUpperCase()}`;
}

export const SupportTicketModel: Model<ISupportTicket> =
  mongoose.models.SupportTicket ||
  mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);
