import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Shared sliding-window rate limit state.
 *
 * Replaces two separate in-process Maps. Those reset on every deploy and cold
 * start, and on a serverless platform each concurrent invocation may hold its
 * own copy - so a limit of five attempts was really five per instance per
 * lifetime, which is not a limit. Keeping the window in the database makes it
 * one shared count, however many instances are running.
 *
 * Redis would be faster and is the usual choice for this. Mongo is used
 * because it is already here: no new service, no new credentials, and the
 * consumer interface in src/lib/rate-limit.ts is narrow enough to swap later.
 */

export interface IRateLimitBucket extends Document {
  /** Namespaced identifier, e.g. `signin:1.2.3.4:user@example.com`. */
  key: string;
  /** Timestamps inside the current window, oldest first. */
  hits: Date[];
  /** When this bucket may be reclaimed; maintained by the TTL index below. */
  expiresAt: Date;
}

const RateLimitBucketSchema = new Schema<IRateLimitBucket>({
  key: { type: String, required: true, unique: true },
  hits: { type: [Date], default: [] },
  expiresAt: { type: Date, required: true },
});

// Mongo removes documents once expiresAt passes, so exhausted buckets are
// cleaned up without a sweeper job. The reaper runs about once a minute, which
// is why the window filter below still applies rather than trusting expiry.
RateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitBucketModel: Model<IRateLimitBucket> =
  mongoose.models.RateLimitBucket ||
  mongoose.model<IRateLimitBucket>('RateLimitBucket', RateLimitBucketSchema);
