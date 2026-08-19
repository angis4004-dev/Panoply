import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A trader's request to take capital off the platform.
 *
 * The mirror of Deposit, and it follows the same rule: the row is not the
 * money, the ledger is the money. This is the paperwork that justifies a
 * debit existing, which is what an auditor asks for.
 *
 * Four states, and the order matters:
 *
 *   pending   the trader has asked. Nothing has moved.
 *   approved  an operator agreed. The ledger is debited AT THIS POINT, so
 *             the funds stop being spendable the moment the decision is
 *             made rather than whenever someone gets round to sending them.
 *   paid      the transfer went out. Records the transaction hash.
 *   rejected  refused, with a reason. Nothing moved.
 *
 * Debiting on approval rather than on payment is deliberate. If the balance
 * only dropped when an operator marked something paid, a trader could file a
 * second request against funds already committed to the first, and both could
 * be approved by two operators looking at the same stale balance. Approval is
 * the decision point, so it is where the money moves.
 *
 * There is no transition out of `approved` back to `pending` or `rejected`.
 * Once the ledger is debited the correction is a new inbound entry, not an
 * edit of history.
 */

export type WithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export interface IWithdrawal extends Document {
  userId: mongoose.Types.ObjectId;
  /**
   * What the trader asked for, in minor units of account currency. Set once,
   * by the trader, and never revised - an operator who disagrees rejects the
   * request rather than quietly paying out a different number.
   */
  amountMinor: number;
  /**
   * The chain this payout goes out on, as a Network key. Denormalised rather
   * than referenced: the row has to stay readable after a network is retired,
   * and the operator needs to know which custody wallet to pay from years
   * after the fact. See src/lib/models/Network.ts.
   */
  networkKey: string;
  /** The asset being sent, e.g. USDT. */
  coin: string;
  /** The saved payout address this was requested against, for the audit trail. */
  payoutAddressId?: mongoose.Types.ObjectId | null;
  /**
   * Snapshot of the destination at request time.
   *
   * Copied from the trader's confirmed payout address for the chosen network
   * rather than read at payout, so that editing or replacing that address
   * afterwards cannot redirect a request already in the queue. An operator
   * sends to what the trader saw.
   */
  destinationAddress: string;
  /** Memo or destination tag, on the chains that use one. */
  destinationMemo?: string;
  /** Horizon in force when the request was made, for the audit trail. */
  horizonAtRequest: 'short' | 'long';
  /** When the capital unlocked, copied in so the decision can be re-checked later. */
  unlockedAt?: Date | null;
  status: WithdrawalStatus;
  reviewedByAdminId?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  /** Free text from the reviewer. */
  reviewNote?: string;
  rejectionReason?: string;
  /** On-chain hash of the outbound transfer. Set when marked paid. */
  txReference?: string;
  paidByAdminId?: mongoose.Types.ObjectId | null;
  paidAt?: Date | null;
  /** The entry that debited the wallet. Set on approval. */
  ledgerEntryId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const WithdrawalSchema = new Schema<IWithdrawal>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountMinor: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => Number.isSafeInteger(v) && v > 0,
        message: 'amountMinor must be a positive integer number of minor units.',
      },
    },
    networkKey: { type: String, required: true, trim: true, uppercase: true, index: true },
    coin: { type: String, required: true, trim: true, uppercase: true },
    payoutAddressId: { type: Schema.Types.ObjectId, ref: 'PayoutAddress', default: null },
    destinationAddress: { type: String, required: true, trim: true },
    destinationMemo: { type: String, trim: true, default: '' },
    horizonAtRequest: { type: String, enum: ['short', 'long'], required: true },
    unlockedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'approved', 'paid', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    txReference: { type: String, default: '', trim: true },
    paidByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    paidAt: { type: Date, default: null },
    ledgerEntryId: { type: Schema.Types.ObjectId, ref: 'LedgerEntry', default: null },
  },
  { timestamps: true }
);

/**
 * One live request per trader.
 *
 * A partial unique index over the two states where funds are still in play.
 * The API checks for a pending request before accepting a new one, but a
 * check-then-write loses to two requests arriving together; this makes the
 * second one fail at the database instead of quietly creating a duplicate
 * claim on the same balance.
 */
WithdrawalSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'approved'] } } }
);

// The operator queue, oldest first - matching how deposits are worked.
WithdrawalSchema.index({ status: 1, createdAt: 1 });

export const WithdrawalModel: Model<IWithdrawal> =
  mongoose.models.Withdrawal || mongoose.model<IWithdrawal>('Withdrawal', WithdrawalSchema);
