import type { Model } from 'mongoose';
import type { IUser } from '@/lib/models/user';
import { MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MS } from '@/lib/pin';

export async function recordFailedPinAttempt(userModel: Model<IUser>, userId: string) {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + PIN_LOCKOUT_MS);
  const nextAttempts = { $add: [{ $ifNull: ['$pinFailedAttempts', 0] }, 1] };
  const reachedLimit = { $gte: [nextAttempts, MAX_PIN_ATTEMPTS] };

  return userModel.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { pinLockedUntil: null },
        { pinLockedUntil: { $exists: false } },
        { pinLockedUntil: { $lte: now } },
      ],
    },
    [
      {
        $set: {
          pinFailedAttempts: { $cond: [reachedLimit, 0, nextAttempts] },
          pinLockedUntil: { $cond: [reachedLimit, lockUntil, null] },
        },
      },
    ],
    { new: true, updatePipeline: true }
  );
}
