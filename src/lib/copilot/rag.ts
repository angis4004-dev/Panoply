import { COPILOT_CORPUS, type CorpusChunk } from './corpus.generated';
import type { RetrievedChunk } from './types';

/**
 * Documentation retrieval for Panoply Copilot.
 *
 * Lexical, not vector. Two reasons, in order of weight.
 *
 * The corpus is about 1,400 words across six sections. At that size the
 * failure mode of term matching - missing a synonym - is far less likely than
 * a reader expects, because the sections are topically distinct: a question
 * about deposits shares almost no vocabulary with the tiers section. An
 * embedding index would be the right answer at a hundred documents; here it
 * would be machinery around a decision that a word count already makes.
 *
 * And it needs no API key, no network call and no ingestion step, so
 * retrieval keeps working when the model provider is unconfigured, is free
 * per query, and can be unit tested without mocking a vendor.
 *
 * Everything above this module sees only `retrieveRelevantContext`, so
 * swapping in embeddings later changes this file and nothing else.
 */

/**
 * Words carrying no topical signal.
 *
 * Deliberately short. An aggressive list starts removing terms that matter in
 * this domain - "how" is noise, but stripping "my" would collapse "my
 * balance" and "balance" into the same query when only one of them is about
 * the reader's own account.
 */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'can',
  'do',
  'does',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'you',
  'your',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Singular/plural folding, so "vaults" matches "vault".
 *
 * A crude suffix trim rather than a stemmer: the corpus is small enough that
 * the only collisions that matter are plurals, and a real stemmer would be a
 * dependency plus a class of surprising matches nobody asked for.
 */
function normalize(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

interface IndexedChunk extends CorpusChunk {
  terms: Map<string, number>;
  length: number;
}

/**
 * Built once at module load. The corpus is a compile-time constant, so this
 * cannot go stale within a process and there is nothing to invalidate.
 */
const INDEX: IndexedChunk[] = COPILOT_CORPUS.map((chunk) => {
  const terms = new Map<string, number>();
  const tokens = tokenize(`${chunk.source} ${chunk.text}`).map(normalize);
  for (const t of tokens) terms.set(t, (terms.get(t) ?? 0) + 1);
  return { ...chunk, terms, length: tokens.length };
});

/** Inverse document frequency, so "panoply" counts for less than "withdrawal". */
const IDF: Map<string, number> = (() => {
  const df = new Map<string, number>();
  for (const chunk of INDEX) {
    for (const term of chunk.terms.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = INDEX.length || 1;
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log(1 + n / count));
  return idf;
})();

/**
 * Below this, a chunk shares only incidental vocabulary with the question.
 *
 * Returning nothing is a supported outcome: the system prompt says so
 * explicitly, and an assistant told "no matching documentation was found"
 * answers from its instructions instead of confidently reciting the tiers
 * section at someone who asked about something else.
 */
const MIN_SCORE = 0.08;

export interface RetrievalOptions {
  /** How many chunks to return. Four is roughly 900 tokens of context. */
  limit?: number;
  minScore?: number;
}

/**
 * The chunks most likely to answer `query`, best first.
 *
 * Scores are length-normalised, so a long section cannot win simply by
 * containing more words than a short, precise one.
 */
export function retrieveRelevantContext(
  query: string,
  options: RetrievalOptions = {}
): RetrievedChunk[] {
  const { limit = 4, minScore = MIN_SCORE } = options;

  const queryTerms = [...new Set(tokenize(query).map(normalize))];
  if (queryTerms.length === 0) return [];

  const scored = INDEX.map((chunk) => {
    let score = 0;
    for (const term of queryTerms) {
      const count = chunk.terms.get(term);
      if (!count) continue;
      // Sub-linear in term frequency: the tenth mention of "vault" says far
      // less than the second about whether this section is the right one.
      score += (IDF.get(term) ?? 0) * (1 + Math.log(count));
    }
    return {
      source: chunk.source,
      text: chunk.text,
      score: chunk.length > 0 ? score / Math.sqrt(chunk.length) : 0,
    };
  });

  return scored
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Visible for tests and for a quick sanity check after editing the docs. */
export function corpusSize(): number {
  return INDEX.length;
}
