import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUserYieldInvestment extends Document {
  userId: mongoose.Types.ObjectId; // Reference to User
  yieldOpportunityId: mongoose.Types.ObjectId; // Reference to YieldOpportunity
  amount: number; // Investment amount
  rewardTokens: number; // Reward tokens earned
  investedAt: Date;
}

const UserYieldInvestmentSchema = new Schema<IUserYieldInvestment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    yieldOpportunityId: {
      type: Schema.Types.ObjectId,
      ref: 'YieldOpportunity',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    rewardTokens: { type: Number, required: true, min: 0, default: 0 },
    investedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Create indexes for efficient querying
UserYieldInvestmentSchema.index({ userId: 1, yieldOpportunityId: 1 }, { unique: true }); // One investment per user per yield opportunity
UserYieldInvestmentSchema.index({ userId: 1 });
UserYieldInvestmentSchema.index({ yieldOpportunityId: 1 });

export const UserYieldInvestmentModel: Model<IUserYieldInvestment> =
  mongoose.models.UserYieldInvestment ||
  mongoose.model<IUserYieldInvestment>('UserYieldInvestment', UserYieldInvestmentSchema);
