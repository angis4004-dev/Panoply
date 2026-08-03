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
 * balance adjustment produces one of each, and they are different questions
 * with different retention and access needs.
 */

export interface IAdminAuditLog extends Document {
  actorUserId: mongoose.Types.ObjectId;
  /** Denormalized so the trail stays readable if the admin account is later renamed or removed. */
  actorEmail: string;
  /** Dot-notated verb, e.g. 'user.update', 'kyc.approve'. */
  action: string;
  targetType: 'user' | 'bot' | 'kyc' | 'model';
  targetId: string;
  /** Only the fields that changed, previous values. */
  before: Record<string, unknown>;
  /** Only the fields that changed, new values. */
  after: Record<string, unknown>;
  reason?: string;
  ip?: string;
  createdAt: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>({
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorEmail: { type: String, required: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true, enum: ['user', 'bot', 'kyc', 'model'] },
  targetId: { type: String, required: true },
  before: { type: Schema.Types.Mixed, default: {} },
  after: { type: Schema.Types.Mixed, default: {} },
  reason: { type: String, default: '' },
  ip: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

// "What was done to this account" and "what did this admin do" are the two
// questions a review actually asks.
AdminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ actorUserId: 1, createdAt: -1 });

// Append-only. As with the ledger, this stops accidental application code
// rather than a determined actor with database credentials - the durable
// control is a database role holding insert-only rights on this collection.
const REJECT_MUTATION = function reject(this: unknown, next: (err?: Error) => void) {
  next(new Error('Audit log entries are append-only.'));
};
AdminAuditLogSchema.pre('updateOne', REJECT_MUTATION);
AdminAuditLogSchema.pre('updateMany', REJECT_MUTATION);
AdminAuditLogSchema.pre('findOneAndUpdate', REJECT_MUTATION);
AdminAuditLogSchema.pre('deleteOne', REJECT_MUTATION);
AdminAuditLogSchema.pre('deleteMany', REJECT_MUTATION);
AdminAuditLogSchema.pre('findOneAndDelete', REJECT_MUTATION);

export const AdminAuditLogModel: Model<IAdminAuditLog> =
  mongoose.models.AdminAuditLog ||
  mongoose.model<IAdminAuditLog>('AdminAuditLog', AdminAuditLogSchema);
