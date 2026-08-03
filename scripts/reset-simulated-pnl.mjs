/**
 * Resets the persisted dry-run P&L on signal flows.
 *
 * Why: simulatedPnlPercent values written before the tick engine was
 * recalibrated (see src/lib/bot-pnl.ts) were produced by a per-tick drift
 * ~100x larger than the current one, compounding to roughly +320%/week. Those
 * accumulated totals are not recoverable by recomputation - the old code path
 * no longer exists - so they are simply zeroed and left to re-accrue under the
 * corrected model.
 *
 * PortfolioSnapshot rows are deliberately NOT touched. They are a time series
 * keyed to wall-clock moments that cannot be re-observed, so deleting them
 * destroys history permanently. Leaving them produces a visible step in the
 * Cumulative P&L chart at the moment of the reset, which is an honest marker
 * of when the correction landed rather than a gap.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/reset-simulated-pnl.mjs
 *   node scripts/reset-simulated-pnl.mjs --apply
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// Minimal .env reader - this runs outside Next.js, which would normally do it.
function loadEnv() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

function fmt(n) {
  return n === null || n === undefined ? 'n/a' : Number(n).toFixed(2);
}

async function main() {
  loadEnv();

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set - nothing to connect to.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });

  const db = mongoose.connection.db;
  const bots = db.collection('tradingbots');
  const snapshots = db.collection('portfoliosnapshots');

  const total = await bots.countDocuments({});
  const nonZero = await bots.countDocuments({ simulatedPnlPercent: { $ne: 0 } });
  const running = await bots.countDocuments({ status: 'running' });

  const [stats] = await bots
    .aggregate([
      {
        $group: {
          _id: null,
          min: { $min: '$simulatedPnlPercent' },
          max: { $max: '$simulatedPnlPercent' },
          avg: { $avg: '$simulatedPnlPercent' },
        },
      },
    ])
    .toArray();

  const snapCount = await snapshots.countDocuments({});
  const oldest = await snapshots.find({}).sort({ timestamp: 1 }).limit(1).toArray();
  const newest = await snapshots.find({}).sort({ timestamp: -1 }).limit(1).toArray();

  console.info('\n=== IN SCOPE (tradingbots) ===');
  console.info(`  total bots           ${total}`);
  console.info(`  running              ${running}`);
  console.info(`  with non-zero P&L    ${nonZero}   <- these get reset`);
  console.info(
    `  simulatedPnlPercent  min ${fmt(stats?.min)}  max ${fmt(stats?.max)}  avg ${fmt(stats?.avg)}`
  );

  console.info('\n=== UNTOUCHED (portfoliosnapshots) ===');
  console.info(`  snapshot rows        ${snapCount}`);
  console.info(`  oldest               ${oldest[0]?.timestamp?.toISOString() ?? 'n/a'}`);
  console.info(`  newest               ${newest[0]?.timestamp?.toISOString() ?? 'n/a'}`);

  if (!APPLY) {
    console.info('\nDRY RUN - nothing written. Re-run with --apply to reset.\n');
    await mongoose.disconnect();
    return;
  }

  const result = await bots.updateMany(
    {},
    { $set: { simulatedPnlPercent: 0, pnl: '+0.0%', lastTickAt: new Date() } }
  );

  console.info(`\nAPPLIED - ${result.modifiedCount} bot(s) reset to +0.0%.`);
  console.info('Snapshots left intact.\n');

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
