import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import type { OrderKind, OrderSide, OrderStatus } from '@/lib/exchange/types';

/**
 * An order the platform sent to a venue, and the fills that came back.
 *
 * The audit trail behind every P&L figure. A user's realized profit is derived
 * from these rows and nothing else, so the question "why does my dashboard say
 * this" has an answer that consists of records rather than a description of an
 * algorithm.
 *
 * Fills are embedded rather than a separate collection. They only ever arrive
 * with or after their order, are never queried independently of it, and are
 * bounded - a spot order fills in ones or tens of pieces, not thousands. A
 * separate collection would buy nothing and cost a join on the hot path.
 *
 * ## clientOrderId is the idempotency key
 *
 * Generated before the request leaves, unique, and stored here. A network
 * timeout during placement is ambiguous: the order may or may not exist at the
 * venue. Without this the recovery is "list recent orders and guess"; with it,
 * the row exists locally in `submitting` state and reconciliation asks the
 * venue for exactly that id.
 */

export type OrderLifecycle =
  /**
   * Written BEFORE the venue is called. The state that makes a timeout
   * recoverable - a row in this state means an order may exist upstream and
   * must be reconciled before anything else is placed for the flow.
   */
  | 'submitting'
  | 'open'
  | 'partial'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  /**
   * The venue was called, the outcome is unknown, and reconciliation has not
   * yet resolved it. Distinct from `submitting`: this one has been retried and
   * still cannot be settled, so it needs an operator.
   */
  | 'unknown';

export interface IEmbeddedFill {
  fillId: string;
  quantity: number;
  price: number;
  /** As charged by the venue, in its own asset. */
  feeAmount: number;
  feeAsset: string;
  /** Converted to quote currency at ingest. Null when the asset was unrecognised. */
  feeQuote: number | null;
  filledAt: Date;
}

export interface IExchangeOrder extends Document {
  userId: Types.ObjectId;
  /** The signal flow this order belongs to. Every order has exactly one. */
  botId: Types.ObjectId;
  /** Adapter that placed it, e.g. 'paper' or 'binance'. */
  venue: string;
  /**
   * Whether this order moved real money. Copied from the adapter at placement
   * rather than looked up later: the adapter's configuration can change, and
   * a historical row must still say what it was at the time.
   */
  isLive: boolean;
  pair: string;
  baseAsset: string;
  quoteAsset: string;
  side: OrderSide;
  kind: OrderKind;
  requestedQuantity: number;
  limitPrice?: number | null;
  clientOrderId: string;
  /** The venue's own id. Absent until it answers. */
  venueOrderId?: string | null;
  status: OrderLifecycle;
  filledQuantity: number;
  averagePrice?: number | null;
  rejectReason?: string;
  fills: IEmbeddedFill[];
  /** Why the strategy placed this. Free text, for the audit trail. */
  rationale?: string;
  submittedAt: Date;
  settledAt?: Date | null;
  /** Last time reconciliation asked the venue about this order. */
  lastReconciledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EmbeddedFillSchema = new Schema<IEmbeddedFill>(
  {
    fillId: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    feeAmount: { type: Number, default: 0 },
    feeAsset: { type: String, default: '' },
    // Null is meaningful: the venue charged a fee in an asset that could not
    // be converted to quote currency. Recorded rather than coerced to zero,
    // which would understate costs on every trade using a discount token.
    feeQuote: { type: Number, default: null },
    filledAt: { type: Date, required: true },
  },
  { _id: false }
);

const ExchangeOrderSchema = new Schema<IExchangeOrder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    botId: { type: Schema.Types.ObjectId, ref: 'TradingBot', required: true, index: true },
    venue: { type: String, required: true, trim: true },
    isLive: { type: Boolean, required: true, index: true },
    pair: { type: String, required: true, trim: true, uppercase: true },
    baseAsset: { type: String, required: true, trim: true, uppercase: true },
    quoteAsset: { type: String, required: true, trim: true, uppercase: true },
    side: { type: String, enum: ['buy', 'sell'], required: true },
    kind: { type: String, enum: ['market', 'limit'], required: true },
    requestedQuantity: { type: Number, required: true },
    limitPrice: { type: Number, default: null },
    clientOrderId: { type: String, required: true },
    venueOrderId: { type: String, default: null },
    status: {
      type: String,
      enum: ['submitting', 'open', 'partial', 'filled', 'cancelled', 'rejected', 'unknown'],
      default: 'submitting',
      index: true,
    },
    filledQuantity: { type: Number, default: 0 },
    averagePrice: { type: Number, default: null },
    rejectReason: { type: String, default: '' },
    fills: { type: [EmbeddedFillSchema], default: [] },
    rationale: { type: String, default: '', maxlength: 500 },
    submittedAt: { type: Date, default: Date.now },
    settledAt: { type: Date, default: null },
    lastReconciledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * One order per client id, globally.
 *
 * The constraint that makes placement safe to retry. A retry carrying the same
 * id loses at the database rather than creating a second order, which is the
 * only place the race can be decided correctly.
 */
ExchangeOrderSchema.index({ clientOrderId: 1 }, { unique: true });

// Rebuilding a position reads every fill for a flow, oldest first. Average
// entry depends on the sequence of buys, so the sort is not cosmetic.
ExchangeOrderSchema.index({ botId: 1, submittedAt: 1 });

// The reconciliation sweep: orders that may exist upstream but are unresolved.
ExchangeOrderSchema.index({ status: 1, submittedAt: 1 });

export const ExchangeOrderModel: Model<IExchangeOrder> =
  mongoose.models.ExchangeOrder ||
  mongoose.model<IExchangeOrder>('ExchangeOrder', ExchangeOrderSchema);

/** Venue status to lifecycle. Kept here so one mapping serves every adapter. */
export function lifecycleFromStatus(status: OrderStatus): OrderLifecycle {
  return status;
}
