import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * No longer the source of the yield panel. Do not add rows expecting them to
 * appear on screen.
 *
 * `/api/yield` now serves live pools from DefiLlama (src/lib/defillama.ts).
 * This schema is kept because UserYieldInvestment declares `ref:
 * 'YieldOpportunity'` against it, and because the collection still exists in
 * the database - it holds eight rows written once on 2026-07-22, which is
 * precisely why the endpoint stopped reading it.
 *
 * If nothing ever populates that ref, this and UserYieldInvestment can both
 * go, and the collection can be dropped.
 */

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
