import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * The platform's trading brakes.
 *
 * A single document. Deliberately database-backed rather than environment
 * configuration, which is the opposite of how going live is decided - and the
 * asymmetry is the point:
 *
 *   Starting to trade real money needs three environment variables and a
 *   deploy. Slow, deliberate, and impossible to do by accident from a browser.
 *
 *   Stopping needs one click in the console, taking effect on the next order.
 *   Fast, because the moment you want to stop is a moment when a deploy cycle
 *   is far too long.
 *
 * Everything here is a ceiling, never a floor. Nothing in this document can
 * cause an order to be placed; each field can only prevent one.
 */

export interface ITradingControl extends Document {
  /** Singleton discriminator. Always 'global'. */
  scope: 'global';
  /**
   * The kill switch. When true no new order is placed by anything, for anyone.
   * Checked immediately before every placement rather than at the start of a
   * cycle, so flipping it stops the very next order rather than the next batch.
   */
  tradingHalted: boolean;
  haltedReason?: string;
  haltedAt?: Date | null;
  haltedByAdminId?: Types.ObjectId | null;
  /**
   * Largest notional a single order may carry, in minor units of quote
   * currency. Catches a strategy bug that tries to buy the world in one go.
   */
  maxOrderNotionalMinor: number;
  /**
   * Largest total position one signal flow may hold, in minor units. A flow
   * that keeps buying without ever selling stops here.
   */
  maxBotPositionMinor: number;
  /** Largest total exposure one trader may hold across every flow. */
  maxUserExposureMinor: number;
  /**
   * Platform-wide realized loss in one UTC day that triggers an automatic
   * halt. The backstop for a strategy that is losing correctly rather than
   * crashing - no error is raised, the money simply leaves.
   */
  maxDailyLossMinor: number;
  /**
   * Minimum seconds between orders for one flow. Stops a misconfigured
   * schedule from turning into a fee-generating loop against the venue.
   */
  minSecondsBetweenOrders: number;
  updatedByAdminId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TradingControlSchema = new Schema<ITradingControl>(
  {
    scope: { type: String, enum: ['global'], default: 'global', unique: true, required: true },
    /*
     * Halted by default. A fresh install, or a database restored without this
     * document, must not begin trading because a row was missing - the safe
     * state has to be the one you get by doing nothing.
     */
    tradingHalted: { type: Boolean, default: true },
    haltedReason: { type: String, default: 'Trading has not been enabled yet.' },
    haltedAt: { type: Date, default: null },
    haltedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    maxOrderNotionalMinor: { type: Number, default: 100_000, min: 0 }, // $1,000
    maxBotPositionMinor: { type: Number, default: 500_000, min: 0 }, // $5,000
    maxUserExposureMinor: { type: Number, default: 2_000_000, min: 0 }, // $20,000
    maxDailyLossMinor: { type: Number, default: 100_000, min: 0 }, // $1,000
    minSecondsBetweenOrders: { type: Number, default: 60, min: 0 },
    updatedByAdminId: { type: Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

export const TradingControlModel: Model<ITradingControl> =
  mongoose.models.TradingControl ||
  mongoose.model<ITradingControl>('TradingControl', TradingControlSchema);

/** The limits, detached from Mongoose, as the pure risk checks want them. */
export interface RiskLimits {
  tradingHalted: boolean;
  haltedReason: string;
  maxOrderNotionalMinor: number;
  maxBotPositionMinor: number;
  maxUserExposureMinor: number;
  maxDailyLossMinor: number;
  minSecondsBetweenOrders: number;
}

/**
 * What applies when no control document exists.
 *
 * Halted. A missing document is not permission to trade - see the schema
 * default above for the same reasoning.
 */
export const HALTED_BY_DEFAULT: RiskLimits = {
  tradingHalted: true,
  haltedReason: 'Trading controls have not been configured.',
  maxOrderNotionalMinor: 0,
  maxBotPositionMinor: 0,
  maxUserExposureMinor: 0,
  maxDailyLossMinor: 0,
  minSecondsBetweenOrders: 60,
};

/**
 * Read the live limits, creating the halted default if absent.
 *
 * Never throws. A database failure here must halt trading rather than
 * propagate into whatever was about to place an order - "could not read the
 * limits" and "there are no limits" have to be the same outcome.
 */
export async function loadRiskLimits(): Promise<RiskLimits> {
  try {
    const doc = await TradingControlModel.findOneAndUpdate(
      { scope: 'global' },
      { $setOnInsert: { scope: 'global' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    if (!doc) return HALTED_BY_DEFAULT;

    return {
      tradingHalted: doc.tradingHalted,
      haltedReason: doc.haltedReason || 'Trading is halted.',
      maxOrderNotionalMinor: doc.maxOrderNotionalMinor,
      maxBotPositionMinor: doc.maxBotPositionMinor,
      maxUserExposureMinor: doc.maxUserExposureMinor,
      maxDailyLossMinor: doc.maxDailyLossMinor,
      minSecondsBetweenOrders: doc.minSecondsBetweenOrders,
    };
  } catch (error) {
    console.error('[risk] Could not read trading controls; halting.', error);
    return HALTED_BY_DEFAULT;
  }
}
