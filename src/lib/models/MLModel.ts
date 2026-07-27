import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMLModel extends Document {
  name: string;
  scope: string;
  confidence: number; // 0-100
  drift: 'stable' | 'watch' | 'critical';
  lastTrained: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MLModelSchema = new Schema<IMLModel>(
  {
    name: { type: String, required: true, trim: true },
    scope: { type: String, required: true, trim: true },
    confidence: { type: Number, required: true, min: 0, max: 100 },
    drift: {
      type: String,
      enum: ['stable', 'watch', 'critical'],
      required: true,
      default: 'stable',
    },
    lastTrained: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Create indexes
MLModelSchema.index({ name: 1 });
MLModelSchema.index({ scope: 1 });
MLModelSchema.index({ drift: 1 });

export const MLModelModel: Model<IMLModel> =
  mongoose.models.MLModel || mongoose.model<IMLModel>('MLModel', MLModelSchema);
