import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AdminRole } from '@/lib/admin/permissions';

/**
 * An operator of the admin console.
 *
 * Deliberately a separate collection from User, not a role flag on it.
 *
 * The previous design made an admin a user with `role: 'Admin'`, which meant a
 * single credential and a single session cookie carried both the ability to
 * trade and the ability to authorize other people's deposits. Anything that
 * leaked a trader session on app.example.com - an XSS in a chart widget, a
 * shared laptop, a stolen cookie - leaked the console with it. Two collections
 * means the trader app has no row it could consult that would grant admin
 * authority, so isolation is structural rather than a check someone has to
 * remember to write.
 *
 * The cost is that an operator who also trades holds two accounts. That is the
 * correct outcome: the two activities have different risk, different session
 * lifetimes, and should be different sign-ins.
 */

export interface IAdminUser extends Document {
  name: string;
  email: string;
  role: AdminRole;
  status: 'active' | 'suspended';
  /** PBKDF2 `salt:key`, same construction as the trader password. */
  passwordHash: string;
  /**
   * Second factor. Required: an admin account without one cannot complete
   * sign-in, so the PIN gate cannot be skipped by simply never setting it.
   */
  pinHash?: string;
  pinSetAt?: Date;
  pinFailedAttempts: number;
  pinLockedUntil?: Date | null;
  loginFailedAttempts: number;
  loginLockedUntil?: Date | null;
  /**
   * Extra permissions beyond the role's defaults. Only ever the grantable
   * subset - see MAIN_ADMIN_ONLY in src/lib/admin/permissions.ts, which is
   * also re-applied on read so a stored value cannot become authority.
   */
  grantedPermissions: string[];
  /** Null for the bootstrap MainAdmin, which no admin created. */
  createdByAdminId?: mongoose.Types.ObjectId | null;
  disabledAt?: Date | null;
  disabledByAdminId?: mongoose.Types.ObjectId | null;
  disabledReason?: string;
  /**
   * Set when an admin must choose a new password before doing anything else -
   * true for every account created by another admin, and for accounts brought
   * across by the migration, whose password was set for a different purpose on
   * a different surface.
   */
  mustChangePassword: boolean;
  /** Set when the account must choose a PIN before the second factor works. */
  mustSetPin: boolean;
  lastLoginAt?: Date | null;
  lastLoginIp?: string;
  /**
   * The User row this account was migrated from, if any. Kept so the migration
   * is idempotent and so an operational question about a pre-migration action
   * can still be traced to the person who took it.
   */
  migratedFromUserId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const AdminUserSchema = new Schema<IAdminUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ['MainAdmin', 'Admin'], required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    passwordHash: { type: String, required: true },
    pinHash: { type: String },
    pinSetAt: { type: Date },
    pinFailedAttempts: { type: Number, default: 0, min: 0 },
    pinLockedUntil: { type: Date, default: null },
    loginFailedAttempts: { type: Number, default: 0, min: 0 },
    loginLockedUntil: { type: Date, default: null },
    grantedPermissions: { type: [String], default: [] },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    disabledAt: { type: Date, default: null },
    disabledByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    disabledReason: { type: String, default: '' },
    mustChangePassword: { type: Boolean, default: false },
    mustSetPin: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: '' },
    migratedFromUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

/**
 * At most one MainAdmin, enforced by the database rather than by the code that
 * happens to create accounts.
 *
 * "Seed exactly one MainAdmin" is a claim that has to survive a re-run of the
 * bootstrap script, two deploys racing on startup, and a future endpoint
 * written by someone who has not read bootstrap.ts. A partial unique index on
 * a constant field is the only version of that claim the application cannot
 * get wrong.
 */
AdminUserSchema.index(
  { role: 1 },
  { unique: true, partialFilterExpression: { role: 'MainAdmin' } }
);

export const AdminUserModel: Model<IAdminUser> =
  mongoose.models.AdminUser || mongoose.model<IAdminUser>('AdminUser', AdminUserSchema);
