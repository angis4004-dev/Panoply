import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * Where a trader's money goes when they withdraw, per chain.
 *
 * Replaces the single `walletAddress` string on the user document for
 * withdrawal purposes. That field had no chain attached to it, which made one
 * specific disaster available: a trader saves an Ethereum address, later
 * requests a payout on Tron, and an operator sends TRC-20 USDT to an address
 * whose key exists only on Ethereum. The transfer succeeds and the money is
 * gone. Binding the address to a network at the moment it is saved - and
 * checking it against that network's format rule - is what removes the
 * possibility rather than warning about it.
 *
 * `user.walletAddress` is deliberately left in place. The achievements engine
 * and the wallet-ownership flow both read it, and this model is not the right
 * shape for either: they ask "has this person confirmed a wallet at all",
 * which is one boolean, not a set of per-chain rows.
 *
 * ## Rows are deactivated, never deleted
 *
 * A withdrawal snapshots the address it was requested against, but also keeps
 * `payoutAddressId` so an investigation can ask which saved entry it came from
 * and when that entry was confirmed. Deleting the row would break that link
 * for exactly the payouts most likely to be investigated.
 */

export type PayoutAddressStatus = 'active' | 'inactive';

export interface IPayoutAddress extends Document {
  userId: Types.ObjectId;
  /** Network key from the catalog. See src/lib/models/Network.ts. */
  networkKey: string;
  /**
   * The asset. Held per address because a trader may want USDT paid to one
   * wallet and ETH to another even on the same chain.
   */
  coin: string;
  address: string;
  /** Memo or destination tag, on the chains that use one. */
  memoTag?: string;
  /** The trader's own name for it, e.g. "Ledger" or "Binance". */
  label?: string;
  /**
   * When the trader confirmed this is theirs.
   *
   * A separate step from saving it, and required before a withdrawal can name
   * it. The confirmation is the trader asserting they control the key - the
   * platform cannot verify that without a signature challenge, so what this
   * records is that they were asked and said yes, which is what an operator
   * needs to see before sending funds somewhere irreversible.
   */
  confirmedAt?: Date | null;
  status: PayoutAddressStatus;
  /**
   * Snapshot of the address rule in force when this was confirmed.
   *
   * Kept so that an address confirmed under one rule is not silently
   * invalidated when an operator edits the network later. It also answers the
   * question an audit asks after a bad payout: what was this checked against
   * at the time?
   */
  validatedAgainstFamily?: string;
  lastUsedAt?: Date | null;
  deactivatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PayoutAddressSchema = new Schema<IPayoutAddress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    networkKey: { type: String, required: true, trim: true, uppercase: true },
    coin: { type: String, required: true, trim: true, uppercase: true },
    address: { type: String, required: true, trim: true },
    memoTag: { type: String, trim: true, default: '' },
    label: { type: String, trim: true, maxlength: 60, default: '' },
    confirmedAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    validatedAgainstFamily: { type: String, default: '' },
    lastUsedAt: { type: Date, default: null },
    deactivatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * One active address per trader, per network, per coin.
 *
 * Without this a trader can hold two active USDT-on-Tron addresses, and the
 * withdrawal form has to pick one arbitrarily - which is how money reaches the
 * wallet someone stopped using. Replacing an address deactivates the old row
 * first, so the constraint survives a replace.
 */
PayoutAddressSchema.index(
  { userId: 1, networkKey: 1, coin: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

// The trader's saved-address list, and the withdrawal form's picker.
PayoutAddressSchema.index({ userId: 1, status: 1, networkKey: 1 });

export const PayoutAddressModel: Model<IPayoutAddress> =
  mongoose.models.PayoutAddress ||
  mongoose.model<IPayoutAddress>('PayoutAddress', PayoutAddressSchema);
