import { posix } from 'node:path';

/**
 * Removes static files a previous release left behind on the server.
 *
 * The uploader only ever adds. That was a deliberate choice - Next names each
 * chunk after its content, so leaving the last release's chunks in place
 * stops a browser that loaded a page just before a deploy from 404ing on the
 * scripts that page asks for next - but it had no end. Every file from every
 * release stayed downloadable at its old URL forever, source maps included.
 * When one release shipped a password in a chunk, removing it from the code
 * left it served at the old address, which crawlers and caches may already
 * hold.
 *
 * So stale files now get a grace period instead of immortality: anything
 * under .next/static that is not part of the release just uploaded, and was
 * last written more than `graceMs` ago, is deleted. An hour covers a page
 * loaded before the deploy asking for its lazy chunks; it does not cover
 * keeping a leaked file online for another day.
 *
 * Deliberately scoped to .next/static - the one directory served straight to
 * browsers. Server-side files are never touched here: deleting the wrong one
 * takes the running app down, and they are not reachable over HTTP anyway.
 *
 * @param {import('ssh2-sftp-client')} client  connected SFTP client
 * @param {string} remoteRoot                   the app root on the server
 * @param {Set<string>} keep                    release-relative paths just uploaded
 * @param {{ graceMs: number, dryRun?: boolean, now?: number, log?: (s: string) => void }} options
 * @returns {Promise<{ scanned: number, deleted: string[], kept: number, failed: string[] }>}
 */
export async function pruneStaleStatic(client, remoteRoot, keep, options) {
  const { graceMs, dryRun = false, now = Date.now(), log = () => {} } = options;
  const staticRoot = posix.join(remoteRoot, '.next', 'static');
  if (!staticRoot.endsWith('/.next/static')) {
    throw new Error(`Refusing to prune outside .next/static: ${staticRoot}`);
  }

  /*
   * Refuse when the release being kept has no static files in it at all.
   *
   * The uploader also runs to push a single restart.txt; called from that path,
   * "delete everything not in the release" would mean every file the live site
   * serves. That call does not reach here today. This makes sure it cannot.
   */
  if (![...keep].some((file) => file.startsWith('.next/static/'))) {
    throw new Error('Refusing to prune: the release being kept contains no .next/static files.');
  }

  const result = { scanned: 0, deleted: [], kept: 0, failed: [] };
  const cutoff = now - graceMs;

  async function walk(dir) {
    let entries;
    try {
      entries = await client.list(dir);
    } catch (error) {
      result.failed.push(`${dir} (list: ${String(error.message || error).slice(0, 60)})`);
      return;
    }
    for (const entry of entries) {
      const full = posix.join(dir, entry.name);
      if (entry.type === 'd') {
        await walk(full);
        continue;
      }
      result.scanned += 1;
      const relative = posix.relative(remoteRoot, full);
      if (keep.has(relative) || entry.modifyTime > cutoff) {
        result.kept += 1;
        continue;
      }
      if (dryRun) {
        result.deleted.push(relative);
        continue;
      }
      try {
        await client.delete(full);
        result.deleted.push(relative);
      } catch (error) {
        result.failed.push(`${relative} (${String(error.message || error).slice(0, 60)})`);
      }
    }
  }

  log(
    `Pruning ${staticRoot} (grace ${Math.round(graceMs / 60000)} min${dryRun ? ', dry run' : ''})`
  );
  await walk(staticRoot);
  return result;
}
