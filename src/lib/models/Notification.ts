import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A durable record of something the account holder should know about.
 *
 * Until now the application had no such thing. Achievements were announced
 * with a toast that faded after a few seconds and was gone permanently - if
 * you were on another tab, or the unlock landed during a page transition, you
 * simply never learned it happened. Everything else told the user nothing at
 * all: a KYC approval, a rejection with a reason, a PIN change, a password
 * reset. The bell in the header was a button with no handler and a red dot
 * that was hardcoded on.
 *
 * Deliberately separate from AdminAuditLog. That answers "who exercised
 * authority over this account" and is written for reviewers; this answers
 * "what should this person be told" and is written for the account holder.
 * A KYC approval produces one of each, phrased entirely differently, and the
 * audit trail must not be readable by the user it describes.
 *
 * Growth is bounded in practice - the catalogue caps achievements at 25, and
 * the remaining sources are account events measured in tens over an account's
 * life - so there is no TTL here. If that stops being true, a TTL index on
 * createdAt is the change, not a purge job.
 */

export type NotificationType = 'achievement' | 'kyc' | 'security' | 'system' | 'wallet';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app destination, e.g. '/dashboard/achievements'. Never external. */
  href?: string;
  /**
   * Present only for notifications whose underlying fact can happen once.
   * See the partial unique index below.
   */
  dedupeKey?: string;
  readAt?: Date | null;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    required: true,
    // 'wallet' covers deposit decisions: the trader is told their transfer was
    // credited or refused. Distinct from 'system' so the bell can group money
    // events, and from 'security' so a credit does not read as an alert.
    enum: ['achievement', 'kyc', 'security', 'system', 'wallet'],
  },
  title: { type: String, required: true },
  body: { type: String, required: true, default: '' },
  href: { type: String },
  dedupeKey: { type: String },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

// The only read the panel performs: this user's notifications, newest first.
NotificationSchema.index({ userId: 1, createdAt: -1 });

/**
 * Makes "notify once about a thing that happened once" enforceable rather
 * than hoped for.
 *
 * Granting an achievement and announcing it are two writes. If the process
 * dies between them, or a retry replays the request, the grant is protected
 * by its own unique index but the announcement is not - so the same unlock
 * could be announced twice, or a repaired grant could never be announced at
 * all. A dedupe key lets the emitter attempt the insert unconditionally and
 * let the database decide.
 *
 * Partial, so the far larger set of genuinely repeatable events - a second
 * KYC rejection after a resubmission, every PIN change - carries no key and
 * is not constrained by it. A unique index over a nullable field would make
 * the second such event collide with the first.
 */
NotificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

export const NotificationModel: Model<INotification> =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);
