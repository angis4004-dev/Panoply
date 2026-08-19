import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITradingBot extends Document {
  type: 'Grid' | 'DCA' | 'Arbitrage' | 'Trailing Stop';
  pair: string; // e.g., 'ETH/USDC'
  userId: mongoose.Types.ObjectId; // Reference to User
  confidence: number; // 0-100
  status: 'running' | 'paused' | 'fallback';
  /**
   * Last computed P&L, formatted for display, e.g. '+4.2%'.
   *
   * A cache of what src/lib/exchange/pnl.ts derives from the flow's fills, not
   * a source of truth - it exists so a list of flows does not have to replay
   * every fill of every flow to render. Anything that must be correct reads
   * computeFlowPnl instead.
   */
  pnl: string;
  coinId: string | null; // Resolved CoinGecko id for the base asset, if recognized
  entryPrice: number | null; // Base asset USD price when the bot was created
  allocatedAmount: number | null; // USD capital allocated from the user's wallet balance
  /**
   * When the scheduler last evaluated this flow, and what it decided.
   *
   * Written on every cycle including the ones that do nothing, because "held,
   * and here is why" is the answer to the question a trader actually asks when
   * a flow looks idle. Null until the first cycle runs.
   *
   * Also the scheduler's fairness key: flows are cycled least-recently-run
   * first, so a run that hits its time budget resumes where it stopped rather
   * than starving whatever sorts last.
   */
  lastCycleAt: Date | null;
  lastCycleReason: string;
  createdAt: Date;
  updatedAt: Date;
}

const TradingBotSchema = new Schema<ITradingBot>(
  {
    type: {
      type: String,
      enum: ['Grid', 'DCA', 'Arbitrage', 'Trailing Stop'],
      required: true,
    },
    pair: { type: String, required: true, trim: true, uppercase: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    confidence: { type: Number, required: true, min: 0, max: 100 },
    status: {
      type: String,
      enum: ['running', 'paused', 'fallback'],
      default: 'running',
    },
    pnl: { type: String, default: '+0.0%' },
    coinId: { type: String, default: null },
    entryPrice: { type: Number, default: null },
    allocatedAmount: { type: Number, default: null, min: 0 },
    lastCycleAt: { type: Date, default: null },
    lastCycleReason: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

// Create indexes
TradingBotSchema.index({ userId: 1 });
TradingBotSchema.index({ pair: 1 });
TradingBotSchema.index({ status: 1 });
// The scheduler's query: running flows, least recently cycled first.
TradingBotSchema.index({ status: 1, lastCycleAt: 1 });

export const TradingBotModel: Model<ITradingBot> =
  mongoose.models.TradingBot || mongoose.model<ITradingBot>('TradingBot', TradingBotSchema);
