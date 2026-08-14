import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A claimed inbound transfer, awaiting an operator's decision.
 *
 * Nothing here touches a balance. A deposit is a request to credit, and it
 * stays a request until an admin with deposit.authorize confirms the
 * blockchain or payment evidence. Authorization then posts a ledger entry -
 * see authorizeDeposit in src/lib/admin/deposits.ts, which flips the status
 * and posts the entry inside one transaction, so a credited deposit and an
 * approved deposit are the same event or neither happened.
 *
 * The row is not the money. The ledger is the money. This is the paperwork
 * that justifies a ledger entry existing, which is what an auditor asks for.
 */

export type DepositStatus = 'pending' | 'approved' | 'rejected';

export interface IDeposit extends Document {
  userId: mongoose.Types.ObjectId;
  /**
   * The published address the trader says they sent to. Required: a deposit
   * that names no address cannot be matched against a wallet, which is the
   * whole of what authorization consists of. Optional in the type because
   * rows created before this became mandatory still have null.
   */
  depositAddressId?: mongoose.Types.ObjectId | null;
  coin: string;
  network: string;
  /** Snapshot of the address at claim time - the published one may later rotate. */
  address: string;
  memoTag?: string;
  /**
   * The on-chain amount as the trader reported it, kept as a string because
   * eighteen-decimal token amounts do not survive a JS number. Informational:
   * the credit is amountMinor, set by the authorizing admin.
   */
  assetAmount: string;
  /**
   * What the wallet will be credited in minor units of account currency.
   * Null until an admin sets it during review - the trader does not get to
   * declare what their transfer is worth.
   */
  creditAmountMinor?: number | null;
  /** Transaction hash or payment reference. */
  txReference: string;
  status: DepositStatus;
  /** Who raised it: a trader declaring a transfer, or an admin recording one. */
  source: 'trader' | 'admin';
  createdByAdminId?: mongoose.Types.ObjectId | null;
  reviewedByAdminId?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  /** Free text from the reviewer: what evidence was checked, or why refused. */
  reviewNote?: string;
  rejectionReason?: string;
  /** The entry that credited the wallet. Set only on approval. */
  ledgerEntryId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const DepositSchema = new Schema<IDeposit>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    depositAddressId: {
      type: Schema.Types.ObjectId,
      ref: 'DepositAddress',
      required: true,
      index: true,
    },
    coin: { type: String, required: true, trim: true, uppercase: true },
    network: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    memoTag: { type: String, trim: true },
    assetAmount: { type: String, required: true, trim: true },
    creditAmountMinor: {
      type: Number,
      default: null,
      validate: {
        validator: (v: number | null) => v === null || (Number.isSafeInteger(v) && v > 0),
        message: 'creditAmountMinor must be a positive integer number of minor units.',
      },
    },
    txReference: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    source: { type: String, enum: ['trader', 'admin'], default: 'trader' },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    reviewedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    ledgerEntryId: { type: Schema.Types.ObjectId, ref: 'LedgerEntry', default: null },
  },
  { timestamps: true }
);

/**
 * One claim per transaction, per network.
 *
 * Without this, the same hash can be submitted twice and approved twice by two
 * reviewers who each see a plausible pending row. The ledger's idempotency key
 * would not help - two Deposit rows produce two different keys. This is the
 * only place that duplication can be caught.
 */
DepositSchema.index({ network: 1, txReference: 1 }, { unique: true });

// The authorization queue, oldest first, is the console's main deposit view.
DepositSchema.index({ status: 1, createdAt: 1 });

export const DepositModel: Model<IDeposit> =
  mongoose.models.Deposit || mongoose.model<IDeposit>('Deposit', DepositSchema);
