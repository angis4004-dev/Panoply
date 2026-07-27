import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IYieldOpportunity extends Document {
  protocol: string;
  chain: string;
  apr7d: number; // 7-day APR
  apr30d: number; // 30-day APR
  riskLevel: 'Low' | 'Medium' | 'High';
}

const YieldOpportunitySchema = new Schema<IYieldOpportunity>(
  {
    protocol: { type: String, required: true, trim: true },
    chain: { type: String, required: true, trim: true },
    apr7d: { type: Number, required: true, min: 0 },
    apr30d: { type: Number, required: true, min: 0 },
    riskLevel: {
      type: String,
      required: true,
      enum: ['Low', 'Medium', 'High'],
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes
YieldOpportunitySchema.index({ protocol: 1 });
YieldOpportunitySchema.index({ chain: 1 });
YieldOpportunitySchema.index({ riskLevel: 1 });

export const YieldOpportunityModel: Model<IYieldOpportunity> =
  mongoose.models.YieldOpportunity ||
  mongoose.model<IYieldOpportunity>('YieldOpportunity', YieldOpportunitySchema);
