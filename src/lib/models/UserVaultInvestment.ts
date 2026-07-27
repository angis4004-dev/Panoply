import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUserVaultInvestment extends Document {
  userId: mongoose.Types.ObjectId; // Reference to User
  vaultId: mongoose.Types.ObjectId; // Reference to Vault
  amount: number; // Investment amount in USDC
  share: number; // Vault tokens received
  investedAt: Date;
}

const UserVaultInvestmentSchema = new Schema<IUserVaultInvestment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    vaultId: { type: Schema.Types.ObjectId, ref: 'Vault', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    share: { type: Number, required: true, min: 0 },
    investedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Create indexes for efficient querying
UserVaultInvestmentSchema.index({ userId: 1, vaultId: 1 }, { unique: true }); // One investment per user per vault
UserVaultInvestmentSchema.index({ userId: 1 });
UserVaultInvestmentSchema.index({ vaultId: 1 });

export const UserVaultInvestmentModel: Model<IUserVaultInvestment> =
  mongoose.models.UserVaultInvestment ||
  mongoose.model<IUserVaultInvestment>('UserVaultInvestment', UserVaultInvestmentSchema);
