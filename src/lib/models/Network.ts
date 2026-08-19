import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import type { AddressCharset, AddressFamily } from '@/lib/crypto-address';

/**
 * The chains the platform will move money on.
 *
 * Admin-owned data rather than a code constant, so an operator can open the
 * console and add BEP20 or Polygon without waiting for a deploy. What the code
 * still owns is how an address on that chain is checked - see
 * src/lib/crypto-address.ts. The admin picks an address family when they add
 * the network; the rule is then enforced strictly, on the custody address they
 * publish and on every trader payout address that names the network.
 *
 * Before this existed, `network` was a free-text column on DepositAddress. An
 * operator could publish "TRC20", "trc-20" and "Tron" as three separate
 * networks for the same chain and the unique index on (coin, network) would
 * permit all three, each with a different address. Nothing checked that the
 * address belonged to the chain named beside it.
 *
 * ## Rows are deactivated, never deleted
 *
 * `key` is written into every Deposit, DepositAddress, PayoutAddress and
 * Withdrawal as a plain string rather than a reference. Those rows are
 * financial history and have to stay readable after a network is retired, so
 * the key is denormalised on purpose and the catalog row must survive to
 * explain what it meant. Deleting a network would orphan the history; the
 * status flag is the only retirement mechanism.
 */

export type NetworkStatus = 'active' | 'inactive';

export interface INetwork extends Document {
  /**
   * Stable uppercase identifier, e.g. ERC20, TRC20, SOL. Written into every
   * row that names a network, and immutable once created - editing it would
   * silently detach the history that already carries the old value.
   */
  key: string;
  /** What a trader sees, e.g. "Ethereum (ERC-20)". Editable. */
  name: string;
  /**
   * Shown under the network on the deposit screen - "Sending on the wrong
   * network will lose your funds" is the sort of thing worth saying per chain,
   * because the chains differ in how much it costs to be wrong.
   */
  description?: string;
  addressFamily: AddressFamily;
  /** Custom-family parameters. Ignored for the named families. */
  addressPrefix?: string;
  addressCharset?: AddressCharset;
  addressMinLength?: number | null;
  addressMaxLength?: number | null;
  /**
   * Whether transfers on this chain carry a memo or destination tag. On the
   * chains that use them, a deposit sent without one is not credited
   * automatically and needs an operator to recover it.
   */
  memoSupported: boolean;
  memoRequired: boolean;
  /**
   * Which coins may be selected on this chain. Empty means no restriction,
   * which is the honest default: the operator knows their custody setup, and
   * a wrong guess here blocks a legitimate deposit.
   */
  coins: string[];
  /**
   * Separate switches on purpose. Suspending payouts on a chain while the hot
   * wallet is refilled should not also stop money coming in, and a chain being
   * wound down needs to accept withdrawals long after it stops taking
   * deposits.
   */
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  /**
   * Smallest withdrawal permitted on this chain, in minor units of account
   * currency. Chains differ by orders of magnitude in what a transfer costs;
   * a payout smaller than its own network fee is a loss for both sides.
   * Null means no floor beyond the platform-wide one.
   */
  minWithdrawalMinor?: number | null;
  /** Display order in the trader's network picker. Lower first. */
  sortOrder: number;
  status: NetworkStatus;
  createdByAdminId?: Types.ObjectId | null;
  updatedByAdminId?: Types.ObjectId | null;
  deactivatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NetworkSchema = new Schema<INetwork>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 20,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    addressFamily: {
      type: String,
      enum: ['evm', 'tron', 'solana', 'custom', 'none'],
      required: true,
      default: 'none',
    },
    addressPrefix: { type: String, trim: true, maxlength: 8, default: '' },
    addressCharset: {
      type: String,
      enum: ['hex', 'base58', 'base32', 'alphanumeric'],
      default: 'alphanumeric',
    },
    addressMinLength: { type: Number, default: null },
    addressMaxLength: { type: Number, default: null },
    memoSupported: { type: Boolean, default: false },
    memoRequired: { type: Boolean, default: false },
    coins: { type: [String], default: [] },
    depositEnabled: { type: Boolean, default: true, index: true },
    withdrawalEnabled: { type: Boolean, default: true, index: true },
    minWithdrawalMinor: {
      type: Number,
      default: null,
      validate: {
        validator: (v: number | null) => v === null || (Number.isSafeInteger(v) && v >= 0),
        message: 'minWithdrawalMinor must be a whole number of minor units.',
      },
    },
    sortOrder: { type: Number, default: 100 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    updatedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    deactivatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The trader's picker and the console list are both this query.
NetworkSchema.index({ status: 1, sortOrder: 1, key: 1 });

/**
 * The address rule for this network, in the shape crypto-address.ts expects.
 *
 * A method rather than a field so there is one conversion from stored columns
 * to rule, used by every caller. resolveAddressRule already discards the
 * custom columns for a named family, so passing them unconditionally is safe.
 */
NetworkSchema.methods.addressRule = function addressRule(this: INetwork) {
  return {
    family: this.addressFamily,
    prefix: this.addressPrefix || undefined,
    charset: this.addressCharset || undefined,
    minLength: this.addressMinLength ?? undefined,
    maxLength: this.addressMaxLength ?? undefined,
  };
};

/**
 * The same conversion for a lean() result, which has no methods.
 *
 * Most read paths use lean() - they are serialising to JSON, not mutating -
 * and would otherwise each rebuild this object slightly differently.
 */
export function networkAddressRule(network: {
  addressFamily: AddressFamily;
  addressPrefix?: string | null;
  addressCharset?: AddressCharset | null;
  addressMinLength?: number | null;
  addressMaxLength?: number | null;
}) {
  return {
    family: network.addressFamily,
    prefix: network.addressPrefix || undefined,
    charset: network.addressCharset || undefined,
    minLength: network.addressMinLength ?? undefined,
    maxLength: network.addressMaxLength ?? undefined,
  };
}

export const NetworkModel: Model<INetwork> =
  mongoose.models.Network || mongoose.model<INetwork>('Network', NetworkSchema);

/**
 * The three chains the platform launches with, used by the seed script.
 *
 * Data, not a constant the code branches on: once seeded these are ordinary
 * rows an admin can rename, disable or supersede. They exist so a fresh
 * install has working deposit networks rather than an empty picker.
 */
export const SEED_NETWORKS: ReadonlyArray<{
  key: string;
  name: string;
  description: string;
  addressFamily: AddressFamily;
  coins: string[];
  sortOrder: number;
}> = [
  {
    key: 'ERC20',
    name: 'Ethereum (ERC-20)',
    description:
      'The Ethereum mainnet. Transfers are reliable but network fees are the highest of the three.',
    addressFamily: 'evm',
    coins: ['USDT', 'USDC', 'ETH'],
    sortOrder: 10,
  },
  {
    key: 'TRC20',
    name: 'Tron (TRC-20)',
    description: 'Low fees and fast confirmation. The usual choice for moving USDT.',
    addressFamily: 'tron',
    coins: ['USDT', 'USDC'],
    sortOrder: 20,
  },
  {
    key: 'SOL',
    name: 'Solana (SPL)',
    description: 'Very low fees and near-instant settlement.',
    addressFamily: 'solana',
    coins: ['USDT', 'USDC', 'SOL'],
    sortOrder: 30,
  },
];
