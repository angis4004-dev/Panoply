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
  /**
   * Six-digit login PIN, PBKDF2-hashed as `salt:key` exactly like the
   * password. Absent until the user sets one, which they are required to do
   * on their next sign-in. See src/lib/pin.ts.
   */
  pinHash?: string;
  pinSetAt?: Date;
  /**
   * Attempt counter and lock, persisted rather than held in memory: a
   * six-digit secret needs a limit that survives a restart and applies across
   * every server instance, which an in-process counter cannot do.
   */
  pinFailedAttempts: number;
  pinLockedUntil?: Date | null;
  /**
   * One-hour token for the forgotten-PIN flow, issued only to a caller who has
   * already proven the password. Deliberately separate from
   * resetPasswordToken: the two recover different secrets, and reusing one
   * token for both would mean a single stolen link resets the password and the
   * second factor together.
   */
  pinResetToken?: string;
  pinResetExpires?: Date;
  /**
   * Password attempt counter, keyed to the account rather than the caller.
   * x-forwarded-for is client-controlled, so an IP-only limit is defeated by
   * rotating it; this one cannot be.
   */
  loginFailedAttempts: number;
  loginLockedUntil?: Date | null;
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
  /**
   * Whether an identity document is on file. Until now this was the only
   * record of one: the upload control set it to true and discarded the file,
   * so a reviewer was told a document existed with no way to look at it. It is
   * now derived from kycDocumentData actually being present.
   */
  kycDocumentProvided?: boolean;
  /**
   * The document itself, AES-256-GCM encrypted by encryptPiiBuffer and stored
   * as the same `v1.<iv>.<tag>.<data>` envelope the identity number uses.
   *
   * `select: false` so it is never returned by an ordinary query. A scanned
   * passport is the most sensitive thing this collection holds, and every
   * existing findById would otherwise start dragging megabytes of it into
   * memory. The two places that need it ask for it explicitly.
   */
  kycDocumentData?: string;
  kycDocumentMimeType?: string;
  kycDocumentSize?: number;
  kycDocumentUploadedAt?: Date;
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
    pinHash: { type: String },
    pinSetAt: { type: Date },
    pinFailedAttempts: { type: Number, default: 0, min: 0 },
    pinLockedUntil: { type: Date, default: null },
    pinResetToken: { type: String },
    pinResetExpires: { type: Date },
    loginFailedAttempts: { type: Number, default: 0, min: 0 },
    loginLockedUntil: { type: Date, default: null },
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
    // select: false keeps megabytes of encrypted image out of every ordinary
    // query. Only the upload route and the admin review route ask for it.
    kycDocumentData: { type: String, select: false },
    kycDocumentMimeType: { type: String },
    kycDocumentSize: { type: Number },
    kycDocumentUploadedAt: { type: Date },
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
