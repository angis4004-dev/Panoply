import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * A mutual-exclusion lease for scheduled work.
 *
 * The trading scheduler must not run twice at once. Two concurrent runs would
 * each read the same position, each decide the same flow should buy, and place
 * the order twice - and neither would be wrong on its own reading of the world.
 * No amount of care inside a single run prevents that; only something outside
 * both of them can.
 *
 * In-process locking cannot do it. The scheduler runs as a serverless function,
 * so a retry, an overlapping cron tick, or a manual trigger each gets a fresh
 * process with its own memory. The lock has to live where every process can see
 * it, which is the database.
 *
 * It is a *lease*, not a lock: it carries an expiry, and a holder that dies
 * without releasing it blocks nothing beyond that expiry. A lock that outlives
 * its holder is worse than no lock, because it stops the platform silently and
 * only a person can clear it.
 */

export interface ISchedulerLock extends Document {
  /** Names the work being serialized, e.g. 'trading-cycle'. */
  name: string;
  /**
   * When the lease lapses. The holder is expected to release before this; the
   * expiry only matters when it could not.
   */
  expiresAt: Date;
  acquiredAt: Date;
  /** Identifies the holder in logs. Not used for correctness. */
  holder: string;
  createdAt: Date;
  updatedAt: Date;
}

const SchedulerLockSchema = new Schema<ISchedulerLock>(
  {
    name: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    acquiredAt: { type: Date, required: true },
    holder: { type: String, default: '' },
  },
  { timestamps: true }
);

export const SchedulerLockModel: Model<ISchedulerLock> =
  mongoose.models.SchedulerLock ||
  mongoose.model<ISchedulerLock>('SchedulerLock', SchedulerLockSchema);

export interface LeaseResult {
  acquired: boolean;
  /** Present when the lease was refused: when the current holder's lease ends. */
  heldUntil?: Date;
}

/**
 * Take the lease for `name`, or report that someone else holds it.
 *
 * The atomicity is in the filter, not in the application code. The update
 * matches only a document whose lease has already lapsed; when a live lease
 * exists the filter misses, the upsert tries to insert a second document with
 * the same name, and the unique index rejects it with a duplicate-key error.
 * That error *is* the refusal. Two callers racing this cannot both win, because
 * MongoDB resolves the conflict, not a read-then-write in one of the processes.
 *
 * Checking `findOne` first and then writing would be the natural way to express
 * this and would be wrong: both callers can read "free" before either writes.
 */
export async function acquireLease(
  name: string,
  ttlSeconds: number,
  holder = ''
): Promise<LeaseResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  try {
    await SchedulerLockModel.findOneAndUpdate(
      { name, expiresAt: { $lte: now } },
      { $set: { expiresAt, acquiredAt: now, holder }, $setOnInsert: { name } },
      { upsert: true, new: true }
    );
    return { acquired: true };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const current = await SchedulerLockModel.findOne({ name }).select('expiresAt').lean();
      return { acquired: false, heldUntil: current?.expiresAt };
    }
    throw error;
  }
}

/**
 * Give the lease back, so the next run does not wait out the full TTL.
 *
 * Never throws. This is called from a `finally`, and a failure to release must
 * not replace the real error from the work itself - the lease expires on its
 * own regardless.
 */
export async function releaseLease(name: string): Promise<void> {
  try {
    await SchedulerLockModel.updateOne({ name }, { $set: { expiresAt: new Date() } });
  } catch (error) {
    console.error(`[scheduler] Could not release the "${name}" lease:`, error);
  }
}
