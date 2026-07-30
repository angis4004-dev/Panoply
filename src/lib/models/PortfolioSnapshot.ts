import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A time-series point of a user's total dry-run P&L across all signal
 * flows, in dollars. Written opportunistically from GET /api/bots (see
 * bot-pnl.ts's tick engine) rather than on a fixed schedule - there is no
 * background worker, so a snapshot is only as fresh as the last time
 * anyone loaded the dashboard. This is what backs the dashboard's
 * "Cumulative P&L" chart; it intentionally excludes wallet deposits/
 * withdrawals, which are capital movements, not profit or loss.
 */
export interface IPortfolioSnapshot extends Document {
  userId: mongoose.Types.ObjectId;
  timestamp: Date;
  totalPnlDollar: number;
}

const PortfolioSnapshotSchema = new Schema<IPortfolioSnapshot>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, default: Date.now },
  totalPnlDollar: { type: Number, required: true },
});

PortfolioSnapshotSchema.index({ userId: 1, timestamp: 1 });

export const PortfolioSnapshotModel: Model<IPortfolioSnapshot> =
  mongoose.models.PortfolioSnapshot ||
  mongoose.model<IPortfolioSnapshot>('PortfolioSnapshot', PortfolioSnapshotSchema);
