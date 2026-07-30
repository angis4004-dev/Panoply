import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITradingBot extends Document {
  type: 'Grid' | 'DCA' | 'Arbitrage' | 'Trailing Stop';
  pair: string; // e.g., 'ETH/USDC'
  userId: mongoose.Types.ObjectId; // Reference to User
  confidence: number; // 0-100
  status: 'running' | 'paused' | 'fallback';
  pnl: string; // e.g., '+4.2%' or '-0.6%' - formatted from simulatedPnlPercent
  coinId: string | null; // Resolved CoinGecko id for the base asset, if recognized
  entryPrice: number | null; // Base asset USD price when the bot was created
  allocatedAmount: number | null; // USD capital allocated from the user's wallet balance
  // Persisted dry-run earnings simulation (see src/lib/bot-pnl.ts). Ticks
  // only accrue while status is 'running' - lastTickAt is reset to "now"
  // whenever a bot transitions into 'running' so a long pause doesn't
  // produce one giant catch-up burst on resume.
  simulatedPnlPercent: number;
  lastTickAt: Date;
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
    simulatedPnlPercent: { type: Number, default: 0 },
    lastTickAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Create indexes
TradingBotSchema.index({ userId: 1 });
TradingBotSchema.index({ pair: 1 });
TradingBotSchema.index({ status: 1 });

export const TradingBotModel: Model<ITradingBot> =
  mongoose.models.TradingBot || mongoose.model<ITradingBot>('TradingBot', TradingBotSchema);
