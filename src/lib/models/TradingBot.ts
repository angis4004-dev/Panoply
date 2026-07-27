import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITradingBot extends Document {
  type: 'Grid' | 'DCA' | 'Arbitrage' | 'Trailing Stop';
  pair: string; // e.g., 'ETH/USDC'
  userId: mongoose.Types.ObjectId; // Reference to User
  confidence: number; // 0-100
  status: 'running' | 'paused' | 'fallback';
  pnl: string; // e.g., '+4.2%' or '-0.6%'
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
