/**
 * Establishes the single MainAdmin and migrates any pre-split admin accounts.
 *
 * This is the only way a MainAdmin comes into existence. There is deliberately
 * no console path: if there were, the top of the hierarchy would be reachable
 * from inside the application, and one compromised admin session would be
 * enough to mint permanent authority. Creating it requires deploy access,
 * which is the level of access that should be needed for the account that can
 * do everything.
 *
 * Safe to run repeatedly. It reports what already exists rather than changing
 * it, and a unique partial index on AdminUser.role enforces "exactly one" even
 * if two copies run at once.
 *
 *   ADMIN_BOOTSTRAP_EMAIL=ops@example.com \
 *   ADMIN_BOOTSTRAP_PASSWORD='...' \
 *   npm run admin:bootstrap
 *
 * Pass --dry-run to see what it would do without writing anything.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');

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

/**
 * Same PBKDF2 construction as src/lib/admin/credentials.ts. Duplicated rather
 * than imported because this script runs outside the Next build and cannot
 * resolve the TypeScript sources or the `@/` alias. If the parameters there
 * ever change, they have to change here too - which is why they are stated
 * explicitly rather than hidden behind defaults.
 */
const ITERATIONS = 100_000;
const KEY_LENGTH = 64;
const DIGEST = 'sha512';

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(secret, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `${salt}:${derived}`;
}

const MIN_PASSWORD_LENGTH = 14;

function passwordComplaint(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Admin passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password));
  if (classes.length < 3) {
    return 'Admin passwords must combine at least three of: lowercase, uppercase, digits, symbols.';
  }
  return null;
}

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  loadEnv();

  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
  const name = (process.env.ADMIN_BOOTSTRAP_NAME || 'Main Administrator').trim();

  if (!process.env.MONGODB_URI) fail('MONGODB_URI is not set.');
  if (!email || !password) {
    fail('ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must both be set.');
  }
  const complaint = passwordComplaint(password);
  if (complaint) fail(complaint);

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const db = mongoose.connection.db;

  const adminUsers = db.collection('adminusers');
  const users = db.collection('users');
  const auditLogs = db.collection('adminauditlogs');

  console.log(`\n  Aegis admin bootstrap${DRY_RUN ? ' (dry run)' : ''}`);
  console.log(`  database: ${mongoose.connection.name}\n`);

  // The index is the thing that makes "exactly one MainAdmin" true, so create
  // it before creating anything that depends on it.
  if (!DRY_RUN) {
    await adminUsers.createIndex({ email: 1 }, { unique: true });
    await adminUsers.createIndex(
      { role: 1 },
      { unique: true, partialFilterExpression: { role: 'MainAdmin' } }
    );
  }

  // --- MainAdmin -----------------------------------------------------------

  const existingMain = await adminUsers.findOne({ role: 'MainAdmin' });
  if (existingMain) {
    if (existingMain.email !== email) {
      fail(
        `A MainAdmin already exists (${existingMain.email}). Refusing to create a second one.\n` +
          '    Suspend the existing account through the console before bootstrapping a replacement.'
      );
    }
    console.log(`  · MainAdmin already present: ${existingMain.email}`);
  } else if (DRY_RUN) {
    console.log(`  + would create MainAdmin: ${email}`);
  } else {
    const now = new Date();
    const { insertedId } = await adminUsers.insertOne({
      name,
      email,
      role: 'MainAdmin',
      status: 'active',
      passwordHash: hashSecret(password),
      grantedPermissions: [],
      createdByAdminId: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      loginFailedAttempts: 0,
      loginLockedUntil: null,
      disabledAt: null,
      disabledByAdminId: null,
      disabledReason: '',
      // The password came from an environment variable, so it is in a
      // deployment config store and quite possibly a shell history. It gets
      // the account through one sign-in and no further.
      mustChangePassword: true,
      mustSetPin: true,
      lastLoginAt: null,
      lastLoginIp: '',
      migratedFromUserId: null,
      createdAt: now,
      updatedAt: now,
    });

    await auditLogs.insertOne({
      actorAdminId: insertedId,
      actorUserId: null,
      actorEmail: email,
      actorRole: 'MainAdmin',
      action: 'admin.bootstrap',
      targetType: 'admin',
      targetId: String(insertedId),
      affectedUserId: null,
      before: {},
      after: { email, role: 'MainAdmin' },
      reason: 'MainAdmin established through the environment-controlled bootstrap.',
      reference: '',
      ip: 'bootstrap',
      userAgent: '',
      sessionId: null,
      createdAt: now,
    });

    console.log(`  + MainAdmin created: ${email}`);
    console.log('    Must change the password and choose a PIN on first sign-in.');
  }

  // --- Legacy admins -------------------------------------------------------

  const legacy = await users.find({ role: 'Admin' }).toArray();
  if (legacy.length === 0) {
    console.log('  · No legacy role:Admin users to migrate.');
  }

  let migrated = 0;
  for (const user of legacy) {
    const legacyEmail = String(user.email).toLowerCase();
    const already = await adminUsers.findOne({ email: legacyEmail });

    if (already) {
      // Already brought across on an earlier run, or the same address as the
      // MainAdmin. Still demote the User row - a half-finished previous run is
      // exactly the state that leaves an account holding both authorities.
      if (DRY_RUN) {
        console.log(`  ~ would demote ${legacyEmail} to Trader (admin account already exists)`);
      } else {
        await users.updateOne(
          { _id: user._id, role: 'Admin' },
          { $set: { role: 'Trader' }, $inc: { tokenVersion: 1 } }
        );
        console.log(
          `  ~ ${legacyEmail}: admin account already existed; user row demoted to Trader`
        );
      }
      continue;
    }

    if (!user.passwordHash) {
      // Google-only sign-in. There is no password to carry and the console has
      // no OAuth path, so this needs a human decision.
      console.log(
        `  ! ${legacyEmail}: no password on the account (OAuth-only). ` +
          'Create the admin account explicitly from the console.'
      );
      continue;
    }

    if (DRY_RUN) {
      console.log(`  + would migrate ${legacyEmail} to an Admin account and demote the user row`);
      migrated += 1;
      continue;
    }

    const now = new Date();
    const { insertedId } = await adminUsers.insertOne({
      name: user.name,
      email: legacyEmail,
      role: 'Admin',
      status: user.status === 'suspended' ? 'suspended' : 'active',
      // The existing hash carries across, so their password still works once.
      passwordHash: user.passwordHash,
      grantedPermissions: [],
      createdByAdminId: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      loginFailedAttempts: 0,
      loginLockedUntil: null,
      disabledAt: null,
      disabledByAdminId: null,
      disabledReason: '',
      // The PIN is deliberately NOT carried across. The trader PIN protects a
      // trading account; reusing it as the console's second factor would mean
      // one compromised secret opens both.
      mustChangePassword: true,
      mustSetPin: true,
      lastLoginAt: null,
      lastLoginIp: '',
      migratedFromUserId: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // This is the part that actually closes the hole: until the User row stops
    // saying 'Admin', any legacy check that survives somewhere still passes.
    // The tokenVersion bump cuts every live trader session for the account, so
    // a cookie minted while it still said 'Admin' stops being honoured now
    // rather than at its own leisure.
    await users.updateOne(
      { _id: user._id },
      { $set: { role: 'Trader' }, $inc: { tokenVersion: 1 } }
    );

    await auditLogs.insertOne({
      actorAdminId: insertedId,
      actorUserId: user._id,
      actorEmail: legacyEmail,
      actorRole: 'Admin',
      action: 'admin.migrate',
      targetType: 'admin',
      targetId: String(insertedId),
      affectedUserId: user._id,
      before: { role: 'Admin', surface: 'trader app' },
      after: { role: 'Admin', surface: 'admin console', userRole: 'Trader' },
      reason: 'Migrated from the pre-split admin model; trader account demoted to Trader.',
      reference: '',
      ip: 'bootstrap',
      userAgent: '',
      sessionId: null,
      createdAt: now,
    });

    console.log(`  + migrated ${legacyEmail}; user row demoted to Trader`);
    migrated += 1;
  }

  const remaining = await users.countDocuments({ role: 'Admin' });
  console.log(`\n  Migrated: ${migrated}`);
  console.log(
    `  Users still holding role:Admin: ${remaining}${remaining ? '  ← investigate' : ''}`
  );
  console.log(
    `  Admin accounts: ${await adminUsers.countDocuments({})} ` +
      `(${await adminUsers.countDocuments({ role: 'MainAdmin' })} MainAdmin)\n`
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('\n  ✗ Bootstrap failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
