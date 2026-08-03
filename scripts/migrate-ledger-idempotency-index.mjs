/**
 * Replaces the ledger's sparse unique index on idempotencyKey with a partial
 * one, and clears the explicit nulls that made the original unusable.
 *
 * The original index was { unique: true, sparse: true } while the schema
 * defaulted idempotencyKey to null. Sparse skips documents where the field is
 * ABSENT; an explicit null is still indexed. So every entry posted without a
 * key indexed the same value, and only one such entry could exist per
 * collection - the second returned E11000 and failed the request that made it.
 *
 * Mongo will not alter an existing index in place, so the old one is dropped
 * and rebuilt. Idempotent: safe to run repeatedly.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/migrate-ledger-idempotency-index.mjs
 *   node scripts/migrate-ledger-idempotency-index.mjs --apply
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const INDEX_NAME = 'idempotencyKey_1';

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
  const entries = mongoose.connection.db.collection('ledgerentries');

  const indexes = await entries.indexes();
  const existing = indexes.find((i) => i.name === INDEX_NAME);
  const nullCount = await entries.countDocuments({ idempotencyKey: null });

  const needsRebuild = !existing || !existing.partialFilterExpression;

  console.info('\n=== LEDGER IDEMPOTENCY INDEX ===');
  console.info(`  index present            ${existing ? 'yes' : 'no'}`);
  console.info(`  currently sparse         ${existing?.sparse ? 'yes' : 'no'}`);
  console.info(`  currently partial        ${existing?.partialFilterExpression ? 'yes' : 'no'}`);
  console.info(`  entries with null key    ${nullCount}`);
  console.info(
    `  action                   ${needsRebuild ? 'drop and rebuild' : 'already correct'}`
  );

  if (!APPLY) {
    console.info('\nDRY RUN - nothing written. Re-run with --apply.\n');
    await mongoose.disconnect();
    return;
  }

  if (existing) {
    await entries.dropIndex(INDEX_NAME);
    console.info(`\n  dropped ${INDEX_NAME}`);
  }

  // Cleared before the index is rebuilt. The partial filter would exclude
  // these anyway, but leaving explicit nulls behind preserves the shape that
  // caused the bug, and any future index built without the filter would fail.
  if (nullCount > 0) {
    const result = await entries.updateMany(
      { idempotencyKey: null },
      { $unset: { idempotencyKey: '' } }
    );
    console.info(`  unset null idempotencyKey on ${result.modifiedCount} entr(ies)`);
  }

  await entries.createIndex(
    { idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
  );
  console.info(`  created ${INDEX_NAME} with partialFilterExpression\n`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
