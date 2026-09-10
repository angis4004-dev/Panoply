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
import { format, resolveConfig } from 'prettier';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(ROOT, 'docs');
const OUT = join(ROOT, 'src', 'lib', 'copilot', 'corpus.generated.ts');

/** Chunks below this are headings with no body and retrieve nothing useful. */
const MIN_CHUNK_CHARS = 120;

/**
 * Documents the assistant is allowed to read at all.
 *
 * The section allowlist below filters headings *within* a document, which
 * quietly assumed every document in docs/ was a customer-facing one. It is
 * not: every document's intro is included unconditionally, because an intro
 * has no heading to check. So the moment docs/cpanel-auto-deploy.md was added
 * - SSH key setup, secret names, server paths - its opening paragraphs went
 * straight into the corpus the customer assistant answers from.
 *
 * Filtering at the document level too means an internal document added next
 * month is excluded by default and has to be named here to become visible.
 * Same direction as the section list, applied one level up, for the same
 * reason: the safe state is the one you get by doing nothing.
 */
const CUSTOMER_FACING_DOCS = new Set(['panoply-overview.md']);

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
  .filter((f) => CUSTOMER_FACING_DOCS.has(f))
  .sort();

const skipped = readdirSync(DOCS_DIR)
  .filter((f) => f.endsWith('.md') && !CUSTOMER_FACING_DOCS.has(f))
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
/*
 * resolveConfig, not just filepath.
 *
 * `filepath` alone only tells Prettier which parser to use - it does not load
 * .prettierrc. So the first version of this formatted with Prettier's own
 * defaults, which double-quote strings, while the repository is configured to
 * single-quote them. The file came out formatted, consistently, and wrong: 14
 * lint errors in a generated file, which fails CI and therefore blocks the
 * deploy of a change that had nothing to do with it.
 */
const prettierOptions = await resolveConfig(OUT);
writeFileSync(OUT, await format(body, { ...prettierOptions, filepath: OUT }), 'utf8');
console.info(
  `[copilot] wrote ${chunks.length} chunks from ${files.length} document(s) to ${OUT.replace(ROOT, '.')}`
);

// Named out loud, every run. A document silently left out of the assistant's
// knowledge is the safe failure, but it should still be a visible one - this
// is the line that tells you a new doc needs adding to CUSTOMER_FACING_DOCS.
if (skipped.length > 0) {
  console.info(`[copilot] treated as internal, not indexed: ${skipped.join(', ')}`);
}
