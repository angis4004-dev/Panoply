import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUserAchievement extends Document {
  userId: mongoose.Types.ObjectId;
  achievementKey: string;
  earnedAt: Date;
  xpAwarded: number;
}

const UserAchievementSchema = new Schema<IUserAchievement>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  achievementKey: { type: String, required: true },
  earnedAt: { type: Date, default: Date.now },
  xpAwarded: { type: Number, required: true },
});

// One record per user per achievement — this index is what makes granting
// idempotent: a duplicate insert throws E11000 instead of creating a second row.
UserAchievementSchema.index({ userId: 1, achievementKey: 1 }, { unique: true });

export const UserAchievementModel: Model<IUserAchievement> =
  mongoose.models.UserAchievement ||
  mongoose.model<IUserAchievement>('UserAchievement', UserAchievementSchema);
