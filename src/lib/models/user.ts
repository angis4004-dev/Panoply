import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  role: 'Admin' | 'Trader';
  passwordHash?: string;
  // Additional fields for admin dashboard
  riskProfile?: 'Conservative' | 'Balanced' | 'Aggressive';
  status?: 'active' | 'flagged' | 'onboarding' | 'suspended';
  bots?: number;
  portfolioValue?: string;
  walletAddress?: string;
  notes?: string;
  image?: string;
  googleId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ['Admin', 'Trader'], required: true },
    passwordHash: { type: String },
    // Additional fields for admin dashboard
    riskProfile: {
      type: String,
      enum: ['Conservative', 'Balanced', 'Aggressive'],
      default: 'Balanced',
    },
    status: {
      type: String,
      enum: ['active', 'flagged', 'onboarding', 'suspended'],
      default: 'active',
    },
    bots: { type: Number, default: 0 },
    portfolioValue: { type: String, default: '$0' },
    walletAddress: { type: String, default: '' },
    notes: { type: String, default: '' },
    image: { type: String },
    googleId: { type: String },
  },
  {
    timestamps: true,
  }
);

// Create indexes
UserSchema.index({ email: 1 });

export const UserModel: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
