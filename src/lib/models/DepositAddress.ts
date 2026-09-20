import mongoose, { Document, Model, Schema, Types } from 'mongoose';

/**
 * A deposit instruction the platform publishes to its traders.
 *
 * These are platform-wide. The MainAdmin enters the custody wallet's address
 * for a coin and network once, and every trader is shown that same address -
 * there is no per-trader assignment. That is a deliberate reversal of the
 * original design: the platform does not run an address-derivation service,
 * so a per-trader address meant an operator hand-entering one row per trader
 * per asset, and a trader whose row had not been created yet simply could not
 * deposit.
 *
 * The consequence is that the chain alone cannot say who sent what - several
 * traders pay into one address. That is why a deposit carries a mandatory
 * transaction reference and is credited only when an admin matches it against
 * the wallet. See src/lib/models/Deposit.ts.
 *
 * Rows are never deleted and the address itself is never edited. Rotating an
 * address creates a new row and marks the old one inactive, pointing each at
 * the other. That matters because traders save addresses, and funds can arrive
 * at one days after it stopped being current: the history has to say what that
 * address was and what replaced it.
 */

/**
 * `platform` is published to every trader. `trader` marks a row from the old
 * per-trader model, kept for history and never shown as a deposit target - see
 * scripts/migrate-platform-addresses.mjs.
 */
export type DepositAddressScope = 'platform' | 'trader';

export interface IDepositAddress extends Document {
  scope: DepositAddressScope;
  /**
   * Legacy. Null on every platform address; set only on rows created by the
   * retired per-trader assignment flow, so their history still names an owner.
   */
  userId?: Types.ObjectId | null;
  coin: string;
  network: string;
  address: string;
  memoTag?: string;
  /** Operator-facing label, e.g. which custody wallet this belongs to. */
  label?: string;
  status: 'active' | 'inactive';
  /**
   * The admin who published it. Kept alongside the legacy `createdBy`, which
   * referenced a User back when admins were users; that field is retained so
   * pre-migration rows still name someone.
   */
  assignedByAdminId?: Types.ObjectId | null;
  createdBy?: Types.ObjectId | null;
  deactivatedAt?: Date | null;
  deactivatedByAdminId?: Types.ObjectId | null;
  deactivationReason?: string;
  /** Set on the old row when this address was rotated out. */
  replacedByAddressId?: Types.ObjectId | null;
  /** Set on the new row when it replaced an earlier one. */
  replacesAddressId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const DepositAddressSchema = new Schema<IDepositAddress>(
  {
    scope: {
      type: String,
      enum: ['platform', 'trader'],
      default: 'platform',
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    coin: { type: String, required: true, trim: true, uppercase: true },
    network: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    memoTag: { type: String, trim: true },
    label: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    assignedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deactivatedAt: { type: Date, default: null },
    deactivatedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    deactivationReason: { type: String, default: '' },
    replacedByAddressId: { type: Schema.Types.ObjectId, ref: 'DepositAddress', default: null },
    replacesAddressId: { type: Schema.Types.ObjectId, ref: 'DepositAddress', default: null },
  },
  { timestamps: true }
);

/**
 * One row per address per coin and network.
 *
 * Scoped to platform rows so it can be built alongside legacy data: the old
 * per-trader model permitted the same address on two traders' rows, and a
 * global unique index would refuse to build on a database that contains one.
 * The same custody address can legitimately receive multiple tokens on one
 * chain, so coin is part of the identity here.
 */
DepositAddressSchema.index(
  { network: 1, address: 1, coin: 1 },
  { unique: true, partialFilterExpression: { scope: 'platform' } }
);

/**
 * One active address per coin and network, platform-wide.
 *
 * Two active USDT-on-TRC20 addresses is not a configuration, it is a support
 * incident: the trader's screen shows one of them arbitrarily, and deposits
 * split across two wallets an operator is not watching equally. Rotation
 * deactivates before it publishes, so the constraint holds through a replace.
 */
DepositAddressSchema.index(
  { coin: 1, network: 1 },
  { unique: true, partialFilterExpression: { status: 'active', scope: 'platform' } }
);

export const DepositAddressModel: Model<IDepositAddress> =
  mongoose.models.DepositAddress ||
  mongoose.model<IDepositAddress>('DepositAddress', DepositAddressSchema);
