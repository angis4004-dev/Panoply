/**
 * Moves deposit addresses from per-trader assignment to platform-wide.
 *
 * Every existing row was created for exactly one trader. Those addresses do
 * not become platform addresses: publishing one trader's address to everybody
 * would send other people's funds into a wallet the ledger attributes to them.
 * So the rows are marked scope:'trader' and retired, kept intact because funds
 * can still arrive at an address a trader saved months ago, and the first
 * question when that happens is whose it was.
 *
 * The MainAdmin then publishes the real platform addresses from the console.
 * Until they do, no trader can deposit - which is correct: better a visible
 * "no addresses yet" than a stale address that credits the wrong account.
 *
 * Also swaps the two unique indexes. Mongo will not alter an index in place,
 * and the old ones are keyed on userId, which platform rows do not have.
 *
 * Idempotent: safe to run repeatedly.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/migrate-platform-addresses.mjs
 *   node scripts/migrate-platform-addresses.mjs --apply
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

// The per-trader indexes. Both are keyed on a field platform rows leave null.
const STALE_INDEXES = ['userId_1_network_1_address_1', 'userId_1_coin_1_network_1'];

const RETIREMENT_REASON =
  'Retired: deposit addresses are now published platform-wide rather than assigned per trader.';

function loadEnv() {
  let raw;
  try {
    raw = readFileSync(join(ROOT, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
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
  const addresses = mongoose.connection.db.collection('depositaddresses');
  const deposits = mongoose.connection.db.collection('deposits');

  // A row predating this migration is one with no scope field at all. Rows the
  // migration has already handled carry scope:'trader'; anything the console
  // creates from now on carries scope:'platform'.
  const legacy = await addresses.countDocuments({ scope: { $exists: false } });
  const legacyActive = await addresses.countDocuments({
    scope: { $exists: false },
    status: 'active',
  });
  const alreadyRetired = await addresses.countDocuments({ scope: 'trader' });
  const platform = await addresses.countDocuments({ scope: 'platform' });
  const orphanDeposits = await deposits.countDocuments({
    $or: [{ depositAddressId: null }, { depositAddressId: { $exists: false } }],
  });

  const indexes = await addresses.indexes();
  const present = STALE_INDEXES.filter((name) => indexes.some((i) => i.name === name));

  console.info('\n=== DEPOSIT ADDRESSES -> PLATFORM SCOPE ===');
  console.info(`  legacy rows to migrate      ${legacy}`);
  console.info(`    of which still active     ${legacyActive}`);
  console.info(`  already retired             ${alreadyRetired}`);
  console.info(`  platform addresses          ${platform}`);
  console.info(`  stale indexes to drop       ${present.length ? present.join(', ') : 'none'}`);
  console.info(`  deposits with no address    ${orphanDeposits}`);

  if (orphanDeposits > 0) {
    // Not fixable here - there is no way to infer which address a deposit was
    // sent to. Reported so it is a known quantity rather than a surprise the
    // first time depositAddressId is dereferenced.
    console.info('    (left as-is; depositAddressId is required only for new rows)');
  }

  if (!APPLY) {
    console.info('\nDRY RUN - nothing written. Re-run with --apply.\n');
    await mongoose.disconnect();
    return;
  }

  console.info('');

  if (legacy > 0) {
    const marked = await addresses.updateMany({ scope: { $exists: false } }, [
      {
        $set: {
          scope: 'trader',
          status: 'inactive',
          // Preserve a deactivation already on the row; only the ones this
          // migration is retiring get today's date and its reason.
          deactivatedAt: { $ifNull: ['$deactivatedAt', '$$NOW'] },
          deactivationReason: {
            $cond: [
              { $in: ['$deactivationReason', [null, '']] },
              RETIREMENT_REASON,
              '$deactivationReason',
            ],
          },
        },
      },
    ]);
    console.info(`  marked ${marked.modifiedCount} legacy row(s) scope:'trader' and retired them`);
  }

  for (const name of present) {
    await addresses.dropIndex(name);
    console.info(`  dropped ${name}`);
  }

  await addresses.createIndex(
    { network: 1, address: 1 },
    { unique: true, partialFilterExpression: { scope: 'platform' } }
  );
  console.info('  created network_1_address_1 (unique, platform only)');

  await addresses.createIndex(
    { coin: 1, network: 1 },
    { unique: true, partialFilterExpression: { status: 'active', scope: 'platform' } }
  );
  console.info('  created coin_1_network_1 (unique, active platform only)');

  await addresses.createIndex({ scope: 1 });
  await deposits.createIndex({ depositAddressId: 1 });
  console.info('  created supporting indexes\n');

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
