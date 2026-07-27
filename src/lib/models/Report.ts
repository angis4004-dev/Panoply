import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReport extends Document {
  userId: mongoose.Types.ObjectId; // Reference to User
  title: string;
  description: string;
  type: 'portfolio' | 'yield' | 'risk' | 'performance';
  status: 'pending' | 'success' | 'failed';
  date: Date;
  metrics?: {
    totalValue?: number;
    riskScore?: number;
    sharpe?: number;
    volatility?: number;
  };
  holdings?: Array<{
    token: string;
    amount: number;
    price: number;
    value: number;
    chain: string;
  }>;
  recommendations?: string[];
}

const ReportSchema = new Schema<IReport>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['portfolio', 'yield', 'risk', 'performance'],
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
    },
    date: { type: Date, default: Date.now },
    metrics: {
      totalValue: { type: Number },
      riskScore: { type: Number },
      sharpe: { type: Number },
      volatility: { type: Number },
    },
    holdings: [
      {
        token: { type: String, required: true },
        amount: { type: Number, required: true },
        price: { type: Number, required: true },
        value: { type: Number, required: true },
        chain: { type: String, required: true },
      },
    ],
    recommendations: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

// Create indexes for efficient querying
ReportSchema.index({ userId: 1 });
ReportSchema.index({ userId: 1, date: -1 }); // For getting recent reports of a user
ReportSchema.index({ type: 1 });
ReportSchema.index({ status: 1 });

export const ReportModel: Model<IReport> =
  mongoose.models.Report || mongoose.model<IReport>('Report', ReportSchema);
