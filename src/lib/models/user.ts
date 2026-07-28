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
  walletBalance: number; // USD balance available to allocate to signal flows (dry-run funds only)
  notes?: string;
  image?: string;
  googleId?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  // KYC / identity verification (UI-only — no third-party provider)
  kycStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  kycSubmittedAt?: Date;
  kycFullName?: string;
  kycDateOfBirth?: string;
  kycCountry?: string;
  kycIdType?: 'passport' | 'drivers_license' | 'national_id';
  kycIdNumber?: string;
  kycDocumentProvided?: boolean;
  kycRejectionReason?: string;
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
    walletBalance: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
    image: { type: String },
    googleId: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    // KYC / identity verification (UI-only — no third-party provider)
    kycStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified',
    },
    kycSubmittedAt: { type: Date },
    kycFullName: { type: String },
    kycDateOfBirth: { type: String },
    kycCountry: { type: String },
    kycIdType: { type: String, enum: ['passport', 'drivers_license', 'national_id'] },
    kycIdNumber: { type: String },
    kycDocumentProvided: { type: Boolean, default: false },
    kycRejectionReason: { type: String },
  },
  {
    timestamps: true,
  }
);

export const UserModel: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
