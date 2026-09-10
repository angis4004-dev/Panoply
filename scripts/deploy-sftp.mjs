#!/usr/bin/env node
/**
 * Uploads a built release to cPanel over SFTP, and proves it arrived.
 *
 * ## Why this exists rather than `lftp mirror`
 *
 * lftp was the obvious tool and it silently lost files. On the first real
 * deploy it reported success while `.next/server/app/api/auth/` arrived as an
 * empty directory, so every request to /api/auth/session returned 500 with
 * "Cannot find module .../route.js". Other directories were missing outright.
 * There was no error in the log - the mirror simply skipped them.
 *
 * Two things made it dangerous rather than merely broken. Next.js names
 * dynamic routes with square brackets - `[id]`, `[...nextauth]` - which are
 * glob metacharacters, and lftp expands remote paths. And the failures were
 * partial: a run that drops 40 files out of 3,200 looks exactly like a run
 * that worked, until a user hits one of the missing routes.
 *
 * So this walks the tree itself, sends every path as a literal string, and
 * counts what landed. A deploy that cannot account for every file fails
 * loudly instead of leaving a half-installed application serving 500s.
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import SftpClient from 'ssh2-sftp-client';

const LOCAL_ROOT = process.env.DEPLOY_LOCAL_DIR || 'deploy';
const REMOTE_ROOT = required('DEPLOY_REMOTE_DIR');
const HOST = required('DEPLOY_HOST');
const USERNAME = required('DEPLOY_USER');
const PORT = Number(process.env.DEPLOY_PORT || 22);
const KEY_PATH = required('DEPLOY_KEY_PATH');

/**
 * Eight at once.
 *
 * The cost here is per-file round trips, not bandwidth, so concurrency is
 * what makes 3,200 small files tolerable. Kept well under the ~10 connection
 * ceiling shared hosts typically enforce: exceeding it gets the whole deploy
 * throttled or dropped, which is a worse failure than being slower.
 */
const CONCURRENCY = 8;

/** Transient SFTP failures are common on shared hosting; permanent ones are not. */
const ATTEMPTS = 3;

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`::error::${name} is not set`);
    process.exit(1);
  }
  return value;
}

/** Every file under `dir`, as paths relative to it, using forward slashes. */
async function collectFiles(dir) {
  const found = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) found.push(relative(dir, full).split(sep).join('/'));
    }
  }
  await walk(dir);
  return found;
}

async function main() {
  const files = await collectFiles(LOCAL_ROOT);
  if (files.length === 0) {
    console.error('::error::Nothing to upload - the release directory is empty.');
    process.exit(1);
  }

  const bytes = (
    await Promise.all(files.map((f) => stat(join(LOCAL_ROOT, f)).then((s) => s.size)))
  ).reduce((a, b) => a + b, 0);
  console.log(`Uploading ${files.length} files (${(bytes / 1048576).toFixed(1)} MB) to ${HOST}`);

  const privateKey = await readFile(KEY_PATH);
  const connect = {
    host: HOST,
    port: PORT,
    username: USERNAME,
    privateKey,
    readyTimeout: 30_000,
    // Shared hosts drop idle connections aggressively; a keepalive costs
    // nothing and prevents a mid-upload disconnect on the slower files.
    keepaliveInterval: 10_000,
  };

  /*
   * Directories are created up front, on one connection, in depth order.
   *
   * Doing it inline during parallel uploads means several workers racing to
   * create the same parent, and the loser sees a failure for a directory that
   * does exist. Creating them first makes the upload phase pure file writes.
   */
  const dirs = [...new Set(files.map((f) => posix.dirname(f)).filter((d) => d !== '.'))].sort(
    (a, b) => a.split('/').length - b.split('/').length
  );

  const setup = new SftpClient();
  await setup.connect(connect);
  await setup.mkdir(REMOTE_ROOT, true).catch(() => {});
  for (const dir of dirs) {
    await setup.mkdir(posix.join(REMOTE_ROOT, dir), true).catch(() => {});
  }
  await setup.end();
  console.log(`Prepared ${dirs.length} directories.`);

  let done = 0;
  const failures = [];
  const queue = [...files];

  async function worker(id) {
    const client = new SftpClient(`w${id}`);
    await client.connect(connect);
    while (queue.length > 0) {
      const file = queue.pop();
      if (!file) break;
      let lastError;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          await client.fastPut(join(LOCAL_ROOT, file), posix.join(REMOTE_ROOT, file));
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          // Back off a little; a shared host under load recovers on its own.
          if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
      if (lastError) failures.push({ file, message: String(lastError.message || lastError) });
      done++;
      if (done % 250 === 0) console.log(`  ${done}/${files.length}`);
    }
    await client.end();
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  if (failures.length > 0) {
    console.error(`::error::${failures.length} file(s) failed to upload.`);
    for (const f of failures.slice(0, 20)) console.error(`  ${f.file}: ${f.message}`);
    process.exit(1);
  }

  // The restart step uploads a single file into a tree of thousands; walking
  // all of it to confirm one write is pure cost.
  if (process.env.DEPLOY_SKIP_AUDIT === 'true') {
    console.log(`Uploaded ${done} file(s).`);
    return;
  }

  /*
   * Count what is actually there, rather than trusting that the writes above
   * all landed. This is the check lftp did not do, and its absence is the
   * whole reason a broken release reached production looking healthy.
   */
  const audit = new SftpClient('audit');
  await audit.connect(connect);
  let remote = 0;
  async function count(dir) {
    const list = await audit.list(dir);
    for (const entry of list) {
      if (entry.type === 'd') await count(posix.join(dir, entry.name));
      else if (entry.type === '-') remote++;
    }
  }
  await count(REMOTE_ROOT);
  await audit.end();

  console.log(`Uploaded ${done} files; server now holds ${remote}.`);
  if (remote < files.length) {
    console.error(
      `::error::Expected at least ${files.length} files on the server but found ${remote}.`
    );
    process.exit(1);
  }
  console.log('Upload verified.');
}

main().catch((error) => {
  console.error('::error::Deploy failed:', error.message || error);
  process.exit(1);
});
