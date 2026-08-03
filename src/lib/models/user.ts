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
  /**
   * Authoritative cached wallet balance in minor units (cents), maintained
   * exclusively by src/lib/ledger.ts inside the same transaction as the entry
   * that changes it. Nothing else may write this field.
   */
  walletBalanceMinor: number;
  /**
   * @deprecated Pre-ledger float balance, in dollars. Retained so the backfill
   * migration has a source and so a rollback is not lossy. No longer read or
   * written - use walletBalanceMinor via the ledger.
   */
  walletBalance: number;
  notes?: string;
  image?: string;
  googleId?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  /**
   * Incremented to invalidate every session issued before the bump. Sessions
   * carry the value they were minted with and are rejected once it falls
   * behind. See revokeUserSessions in src/lib/session.ts.
   */
  tokenVersion: number;
  // KYC / identity verification (UI-only — no third-party provider)
  kycStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  kycSubmittedAt?: Date;
  kycFullName?: string;
  kycDateOfBirth?: string;
  kycCountry?: string;
  kycIdType?: 'passport' | 'drivers_license' | 'national_id';
  /**
   * Government identity number, encrypted at rest by src/lib/pii-crypto.ts.
   * Never read this directly for display - it is ciphertext. Decrypt only in
   * the admin review path, where seeing the real number is the point.
   */
  kycIdNumber?: string;
  /**
   * Last four characters, in the clear, so the owner can recognize which
   * document is on file without anything having to decrypt the full value.
   */
  kycIdNumberLast4?: string;
  kycDocumentProvided?: boolean;
  kycRejectionReason?: string;
  // Achievement / tier engine
  emailVerified: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  profileCompletedAt?: Date;
  walletOwnershipConfirmed: boolean;
  walletOwnershipConfirmedAt?: Date;
  lifetimeDeposited: number;
  xp: number;
  tier: 'unverified' | 'novice' | 'amateur' | 'strategist' | 'vanguard';
  currentStreak: number;
  longestStreak: number;
  lastActiveDate?: Date;
  visitedSections: string[];
  distinctPortfolioAssets: string[];
  portfolioReportCount: number;
  distinctBotStrategyTypes: string[];
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
    walletBalanceMinor: { type: Number, default: 0, min: 0 },
    walletBalance: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
    image: { type: String },
    googleId: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    tokenVersion: { type: Number, default: 0, min: 0 },
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
    kycIdNumberLast4: { type: String },
    kycDocumentProvided: { type: Boolean, default: false },
    kycRejectionReason: { type: String },
    // Achievement / tier engine
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    emailVerificationExpires: { type: Date },
    profileCompletedAt: { type: Date },
    walletOwnershipConfirmed: { type: Boolean, default: false },
    walletOwnershipConfirmedAt: { type: Date },
    lifetimeDeposited: { type: Number, default: 0, min: 0 },
    xp: { type: Number, default: 0, min: 0 },
    tier: {
      type: String,
      enum: ['unverified', 'novice', 'amateur', 'strategist', 'vanguard'],
      default: 'unverified',
    },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastActiveDate: { type: Date },
    visitedSections: { type: [String], default: [] },
    distinctPortfolioAssets: { type: [String], default: [] },
    portfolioReportCount: { type: Number, default: 0, min: 0 },
    distinctBotStrategyTypes: { type: [String], default: [] },
  },
  {
    timestamps: true,
  }
);

export const UserModel: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
