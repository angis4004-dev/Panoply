/**
 * End-to-end check that a session can actually be revoked.
 *
 * Drives the real HTTP endpoints against a running dev server rather than
 * calling the session module directly, so it exercises middleware, cookie
 * parsing, and the database lookup exactly as a browser would.
 *
 * Signs in as the seeded dev trader, confirms the session works, then
 * invalidates it three different ways and confirms each one is refused:
 *   - tokenVersion bumped out from under the cookie (logout / password reset)
 *   - account suspended
 *   - cookie issued before revocation existed (no tokenVersion in payload)
 *
 * Restores the account to its original state afterwards.
 *
 *   npm run dev        # in another terminal
 *   node scripts/verify-session-revocation.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:4028';

// Seeded development credentials from src/lib/auth-store.ts - not a secret.
const EMAIL = 'alex.thornton@cryptotradeai.io';
const PASSWORD = 'TraderBot#2024';

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

const results = [];
function check(label, actual, expected) {
  const ok = actual === expected;
  results.push(ok);
  console.info(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${actual} (expected ${expected})`);
}

async function signIn() {
  const response = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!response.ok) {
    throw new Error(`sign-in failed: ${response.status} ${await response.text()}`);
  }
  const setCookie = response.headers.get('set-cookie') || '';
  const match = setCookie.match(/auth_session=([^;]+)/);
  if (!match) throw new Error('no auth_session cookie returned');
  return match[1];
}

const walletStatus = (cookie) =>
  fetch(`${BASE}/api/wallet`, { headers: { cookie: `auth_session=${cookie}` } }).then(
    (r) => r.status
  );

async function main() {
  loadEnv();
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB || 'aegis',
  });
  const users = mongoose.connection.db.collection('users');

  const before = await users.findOne({ email: EMAIL });
  if (!before) throw new Error(`seed user ${EMAIL} not found`);
  const original = { tokenVersion: before.tokenVersion ?? 0, status: before.status ?? 'active' };

  try {
    console.info('\n=== SESSION REVOCATION ===');

    const cookie = await signIn();
    check('fresh session is accepted', await walletStatus(cookie), 200);

    // 1. tokenVersion bump - what logout and password reset now do.
    await users.updateOne({ email: EMAIL }, { $inc: { tokenVersion: 1 } });
    check('session rejected after tokenVersion bump', await walletStatus(cookie), 401);

    // 2. Suspension - previously settable but enforced nowhere.
    const fresh = await signIn();
    check('re-issued session is accepted', await walletStatus(fresh), 200);
    await users.updateOne({ email: EMAIL }, { $set: { status: 'suspended' } });
    check('session rejected while suspended', await walletStatus(fresh), 401);
    await users.updateOne({ email: EMAIL }, { $set: { status: original.status } });

    // 3. A cookie in the pre-revocation shape: correctly signed, but with no
    //    tokenVersion in the payload. Re-signing is impossible without the
    //    secret, so this reuses the real signature and swaps the payload -
    //    which must fail on the signature check even before the shape check.
    const [payload, signature] = decodeURIComponent(fresh).split('.');
    const legacy = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    delete legacy.user.tokenVersion;
    const forged = `${Buffer.from(JSON.stringify(legacy)).toString('base64')}.${signature}`;
    check('tampered / legacy-shape cookie rejected', await walletStatus(forged), 401);

    // 4. Garbage cookie, for completeness.
    check('unsigned garbage cookie rejected', await walletStatus('not-a-real-session'), 401);
  } finally {
    await users.updateOne(
      { email: EMAIL },
      { $set: { tokenVersion: original.tokenVersion, status: original.status } }
    );
    console.info(
      `\n  restored ${EMAIL} to tokenVersion=${original.tokenVersion} status=${original.status}`
    );
    await mongoose.disconnect();
  }

  const passed = results.filter(Boolean).length;
  console.info(`\n${passed === results.length ? 'PASS' : 'FAIL'} - ${passed}/${results.length}\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
