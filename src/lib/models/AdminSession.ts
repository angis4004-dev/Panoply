import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A live admin console session, held server-side.
 *
 * The trader app uses a self-contained signed cookie with a revocation counter
 * on the user document. That is a reasonable trade for a consumer session, but
 * it cannot answer the questions an operations console has to answer: which
 * sessions are open right now, from where, and can I end that one without
 * ending my own.
 *
 * So the admin cookie carries an opaque random token and nothing else. All the
 * authority lives in this row. Revoking is a write here and takes effect on
 * the next request, individually, with a recorded reason.
 *
 * Only the SHA-256 of the token is stored. A dump of this collection therefore
 * does not let the holder sign in as anyone - the same reason password hashes
 * exist. The token is high-entropy and single-use-per-session, so a plain hash
 * without a work factor is appropriate here; there is nothing to brute-force.
 */

export interface IAdminSession extends Document {
  adminId: mongoose.Types.ObjectId;
  tokenHash: string;
  /** Hard ceiling. Reached regardless of activity. */
  expiresAt: Date;
  /**
   * Rolling deadline, pushed forward on each authenticated request. An admin
   * who walks away from an unlocked machine loses the session well before the
   * absolute expiry.
   */
  idleExpiresAt: Date;
  lastSeenAt: Date;
  ip: string;
  userAgent: string;
  revokedAt?: Date | null;
  /** Null when the session ended itself (sign-out) rather than being cut off. */
  revokedByAdminId?: mongoose.Types.ObjectId | null;
  revokeReason?: string;
  createdAt: Date;
}

const AdminSessionSchema = new Schema<IAdminSession>({
  adminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  idleExpiresAt: { type: Date, required: true },
  lastSeenAt: { type: Date, default: Date.now },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  revokedAt: { type: Date, default: null },
  revokedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  revokeReason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

/**
 * Mongo removes the row itself once the absolute expiry passes.
 *
 * Expiry is still checked in application code on every request - the TTL
 * monitor runs about once a minute, so a row can outlive its expiresAt by
 * that much. This index is housekeeping, not the control.
 */
AdminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// "Show me this admin's open sessions" is the query the console's session list
// and the revoke-all path both run.
AdminSessionSchema.index({ adminId: 1, revokedAt: 1, expiresAt: -1 });

export const AdminSessionModel: Model<IAdminSession> =
  mongoose.models.AdminSession || mongoose.model<IAdminSession>('AdminSession', AdminSessionSchema);
