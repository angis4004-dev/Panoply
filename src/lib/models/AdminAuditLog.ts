import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Append-only record of every administrative mutation.
 *
 * Admin actions previously left no trace at all: a balance could be set, an
 * account suspended, a KYC application approved, and afterwards nothing in the
 * system said who did it or what the value had been. That is the first thing
 * any operational review asks for, and its absence is indefensible in a
 * product that holds other people's money.
 *
 * Deliberately separate from LedgerEntry. The ledger answers "what happened to
 * this money"; this answers "who exercised authority over this account". A
 * deposit authorization produces one of each, and they are different questions
 * with different retention and access needs.
 */

export type AuditTargetType =
  | 'user'
  | 'bot'
  | 'kyc'
  | 'model'
  | 'admin'
  | 'network'
  | 'deposit_address'
  | 'payout_address'
  | 'deposit'
  | 'withdrawal'
  | 'session'
  | 'trading_control'
  | 'support_ticket';

export interface IAdminAuditLog extends Document {
  /**
   * The acting admin account. Optional only because entries written before the
   * console was split out name a User instead; every new entry sets it.
   */
  actorAdminId?: mongoose.Types.ObjectId | null;
  /** Legacy actor reference, from when admins were rows in the users collection. */
  actorUserId?: mongoose.Types.ObjectId | null;
  /** Denormalized so the trail stays readable if the admin account is later renamed or removed. */
  actorEmail: string;
  /** Denormalized for the same reason, and so a filter by authority level is one field away. */
  actorRole?: string;
  /** Dot-notated verb, e.g. 'user.update', 'kyc.approve', 'deposit.approve'. */
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  /**
   * The trader an action ultimately affected, when the target is not the
   * trader themselves. Deactivating a deposit address targets the address;
   * the question later asked is "what was done to this trader's account", and
   * without this that query cannot be written.
   */
  affectedUserId?: mongoose.Types.ObjectId | null;
  /** Only the fields that changed, previous values. */
  before: Record<string, unknown>;
  /** Only the fields that changed, new values. */
  after: Record<string, unknown>;
  reason?: string;
  /** Transaction hash, deposit id, or whatever else identifies the evidence. */
  reference?: string;
  ip?: string;
  userAgent?: string;
  /** The admin session the action was taken from, so a compromised session's full blast radius is one query. */
  sessionId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>({
  actorAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null, index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  actorEmail: { type: String, required: true },
  actorRole: { type: String, default: '' },
  action: { type: String, required: true, index: true },
  targetType: {
    type: String,
    required: true,
    enum: [
      'user',
      'bot',
      'kyc',
      'model',
      'admin',
      'network',
      'deposit_address',
      'payout_address',
      'deposit',
      'withdrawal',
      'session',
      'trading_control',
      'support_ticket',
    ],
  },
  targetId: { type: String, required: true },
  affectedUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  before: { type: Schema.Types.Mixed, default: {} },
  after: { type: Schema.Types.Mixed, default: {} },
  reason: { type: String, default: '' },
  reference: { type: String, default: '' },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AdminSession', default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

// "What was done to this account" and "what did this admin do" are the two
// questions a review actually asks. The third is "who touched this reference",
// which is how an investigation into one transaction starts.
AdminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ actorAdminId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ affectedUserId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ reference: 1 });

// Append-only. As with the ledger, this stops accidental application code
// rather than a determined actor with database credentials - the durable
// control is a database role holding insert-only rights on this collection.
function rejectMutation(next: (err?: Error) => void) {
  next(new Error('Audit log entries are append-only.'));
}

for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const) {
  // See the matching comment in LedgerEntry.ts for why this is cast.
  (AdminAuditLogSchema.pre as unknown as (o: string, fn: typeof rejectMutation) => void)(
    op,
    rejectMutation
  );
}

export const AdminAuditLogModel: Model<IAdminAuditLog> =
  mongoose.models.AdminAuditLog ||
  mongoose.model<IAdminAuditLog>('AdminAuditLog', AdminAuditLogSchema);
