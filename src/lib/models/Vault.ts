import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVault extends Document {
  name: string;
  strategy: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  managerScore: number; // 0-100
  aum: string; // Assets Under Management, e.g., "$10M"
  apr: number; // Annual Percentage Rate
}

const VaultSchema = new Schema<IVault>(
  {
    name: { type: String, required: true, trim: true },
    strategy: { type: String, required: true, trim: true },
    riskLevel: {
      type: String,
      required: true,
      enum: ['Low', 'Medium', 'High'],
    },
    managerScore: { type: Number, required: true, min: 0, max: 100 },
    aum: { type: String, required: true },
    apr: { type: Number, required: true, min: 0 },
  },
  {
    timestamps: true,
  }
);

// Create indexes
VaultSchema.index({ name: 1 });
VaultSchema.index({ strategy: 1 });
VaultSchema.index({ riskLevel: 1 });

export const VaultModel: Model<IVault> =
  mongoose.models.Vault || mongoose.model<IVault>('Vault', VaultSchema);
