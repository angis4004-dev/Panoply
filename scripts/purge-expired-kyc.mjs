/**
 * Deletes KYC identity data that is past its retention window.
 *
 * Encryption limits what a database breach yields; retention limits how long
 * there is anything to yield. Once a submission has been decided and the
 * retention period has passed, the identity number and date of birth serve no
 * further operational purpose and are removed.
 *
 * What is kept: kycStatus, kycSubmittedAt, kycCountry, kycIdType, and the last
 * four characters. That is enough to evidence that a check was performed and
 * when - the thing an auditor asks for - without retaining the identifier
 * itself. What is removed: kycIdNumber and kycDateOfBirth.
 *
 * Only 'verified' and 'rejected' records are eligible. A 'pending' submission
 * is still being worked and is never purged regardless of age.
 *
 * The default window is deliberately conservative. Real retention periods are
 * set by the AML regime you operate under, not by this script - most require
 * records be KEPT for a period (commonly five years after the relationship
 * ends), so confirm the number with counsel before scheduling this.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node scripts/purge-expired-kyc.mjs --days 1825
 *   node scripts/purge-expired-kyc.mjs --days 1825 --apply
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

const daysArg = process.argv.indexOf('--days');
const RETENTION_DAYS = daysArg !== -1 ? Number(process.argv[daysArg + 1]) : 1825; // 5 years

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

async function main() {
  loadEnv();

  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) {
    console.error('--days must be a positive number.');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set - nothing to connect to.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const users = mongoose.connection.db.collection('users');

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const filter = {
    kycStatus: { $in: ['verified', 'rejected'] },
    kycSubmittedAt: { $lt: cutoff },
    kycIdNumber: { $exists: true, $nin: [null, ''] },
  };

  const eligible = await users
    .find(filter, {
      projection: { email: 1, kycStatus: 1, kycSubmittedAt: 1, kycIdNumberLast4: 1 },
    })
    .toArray();

  console.info('\n=== KYC RETENTION PURGE ===');
  console.info(`  retention window     ${RETENTION_DAYS} days`);
  console.info(`  cutoff               ${cutoff.toISOString()}`);
  console.info(`  eligible records     ${eligible.length}`);

  for (const user of eligible) {
    console.info(
      `    ${String(user.email).padEnd(34)} ${String(user.kycStatus).padEnd(10)} submitted ${
        user.kycSubmittedAt ? new Date(user.kycSubmittedAt).toISOString().slice(0, 10) : 'unknown'
      }`
    );
  }

  if (!APPLY) {
    console.info('\nDRY RUN - nothing written. Re-run with --apply to purge.\n');
    await mongoose.disconnect();
    return;
  }

  const result = await users.updateMany(filter, {
    $unset: { kycIdNumber: '', kycDateOfBirth: '' },
    $set: { kycRetentionPurgedAt: new Date() },
  });

  console.info(`\nAPPLIED - ${result.modifiedCount} record(s) purged.`);
  console.info('Status, date, country, id type, and last four retained as evidence.\n');

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
