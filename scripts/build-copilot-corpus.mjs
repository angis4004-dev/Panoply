#!/usr/bin/env node
/**
 * Turns Panoply's markdown documentation into a chunked corpus module.
 *
 * Generated into src/ and committed rather than read from docs/ at runtime.
 * A route handler reading the filesystem has to have the file present in the
 * deployed bundle, which depends on tracing configuration and breaks silently
 * on some targets - the assistant would simply start answering without any
 * documentation and never say so. A generated module is an import: if it is
 * missing the build fails, which is the failure you want.
 *
 * Run after editing anything under docs/:
 *   node scripts/build-copilot-corpus.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { format } from 'prettier';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(ROOT, 'docs');
const OUT = join(ROOT, 'src', 'lib', 'copilot', 'corpus.generated.ts');

/** Chunks below this are headings with no body and retrieve nothing useful. */
const MIN_CHUNK_CHARS = 120;

/**
 * Sections the assistant is allowed to quote to a customer.
 *
 * An allowlist, not a blocklist, and that direction is the whole point: docs/
 * is written for engineers, so a section added next month is internal until
 * somebody decides otherwise. A blocklist would leak it by default.
 *
 * Concretely, here is what this keeps out today. "Known gaps" is a defect
 * table containing "Password-reset and PIN-reset flows call no rate limiter"
 * and a note that the MFA flag is never set. Retrieval would have served that
 * verbatim to anyone asking the Copilot what Panoply's security weaknesses
 * are - a working attack plan, published on request. "Architecture", "Two
 * applications" and "Running it" are merely internal; that one is dangerous.
 */
const CUSTOMER_FACING_SECTIONS = new Set([
  'What a trader can do',
  'How money actually moves',
  'Tiers and progression',
  'Signal flows and automated strategies',
  'Vaults, yield and portfolio',
  // How to reach the assistant and, when it cannot help, a person. Written
  // for customers by definition - it is the answer to "how do I get help",
  // which is the question the assistant is most likely to be asked and the
  // one it must never answer with "I don't know".
  'Getting help',
  'Security model',
]);

/**
 * Split on `##` headings.
 *
 * The documents are written with one topic per section, so the author's own
 * headings are better chunk boundaries than any fixed token window: a window
 * would cut "How money actually moves" in half and retrieve the second half
 * without the sentence that says what it is about.
 */
function chunkMarkdown(markdown, docTitle) {
  const lines = markdown.split(/\r?\n/);
  const chunks = [];
  let heading = docTitle;
  let buffer = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    const isIntro = heading === docTitle;
    if (text.length >= MIN_CHUNK_CHARS && (isIntro || CUSTOMER_FACING_SECTIONS.has(heading))) {
      // The intro has no section name of its own; repeating the document title
      // either side of a dash reads as a bug.
      chunks.push({ source: isIntro ? docTitle : `${docTitle} — ${heading}`, text });
    }
    buffer = [];
  };

  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      flush();
      heading = m[1].replace(/[`*_]/g, '').trim();
      continue;
    }
    // Drop the H1; its content is the document title we already carry.
    if (/^#\s+/.test(line)) continue;
    buffer.push(line);
  }
  flush();
  return chunks;
}

function titleFor(markdown, filename) {
  const m = /^#\s+(.*)$/m.exec(markdown);
  return (m ? m[1] : basename(filename, '.md')).replace(/[`*_]/g, '').trim();
}

const files = readdirSync(DOCS_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();

const chunks = [];
for (const file of files) {
  const markdown = readFileSync(join(DOCS_DIR, file), 'utf8');
  chunks.push(...chunkMarkdown(markdown, titleFor(markdown, file)));
}

const banner = `/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Produced by scripts/build-copilot-corpus.mjs from the markdown under docs/.
 * Edit the documentation and re-run the script; editing this file directly
 * means the next run silently discards your change.
 */`;

const body = `${banner}

export interface CorpusChunk {
  source: string;
  text: string;
}

export const COPILOT_CORPUS: CorpusChunk[] = ${JSON.stringify(chunks, null, 2)};
`;

/*
 * Formatted before it is written, not left for somebody to remember.
 *
 * JSON.stringify emits double-quoted keys and strings, which Prettier rejects
 * - so without this, `npm run lint` fails every time anyone edits a file under
 * docs/, on a file they did not hand-write. The failure is noise, the fix is
 * always the same, and a lint error people learn to ignore is worse than no
 * lint error at all.
 */
writeFileSync(OUT, await format(body, { filepath: OUT }), 'utf8');
console.info(
  `[copilot] wrote ${chunks.length} chunks from ${files.length} document(s) to ${OUT.replace(ROOT, '.')}`
);
