import mongoose from 'mongoose';
import { PortfolioSnapshotModel } from '@/lib/models';

// There is no background worker, so snapshots are written opportunistically
// whenever a user's dashboard triggers a bots read. Throttling to once per
// interval keeps the collection from growing one row per poll while still
// giving the "Cumulative P&L" chart enough resolution to be useful over a
// day - 5 minutes yields ~288 possible points/day, plenty for a 7d-1y chart.
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Records a new portfolio P&L snapshot for this user if enough time has
 * passed since their last one. Fire-and-forget from the caller's
 * perspective - failures here shouldn't fail the bots request that
 * triggered them.
 */
export async function recordSnapshotIfDue(
  userId: string | mongoose.Types.ObjectId,
  totalPnlDollar: number
): Promise<void> {
  try {
    const last = await PortfolioSnapshotModel.findOne({ userId })
      .sort({ timestamp: -1 })
      .select('timestamp')
      .lean();

    const dueAt = last ? new Date(last.timestamp.getTime() + SNAPSHOT_INTERVAL_MS) : null;
    if (dueAt && dueAt.getTime() > Date.now()) return;

    await PortfolioSnapshotModel.create({ userId, totalPnlDollar });
  } catch (error) {
    console.error('Error recording portfolio snapshot:', error);
  }
}
