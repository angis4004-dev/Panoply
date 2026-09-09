import type { CopilotModelProvider, CopilotTurn } from './types';

/**
 * Gemini, over plain REST.
 *
 * No SDK. The call is one POST with a JSON body, and `@google/genai` would
 * add a dependency plus its own release cadence to a project that currently
 * has no AI packages at all. If a second provider is ever wired, it
 * implements CopilotModelProvider beside this one rather than replacing it.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Flash, not Pro, and pinned rather than aliased.
 *
 * The free tier is the budget for this feature. Flash is the cheapest model
 * that can follow the safety rules in the system prompt reliably, and a
 * support assistant grounded in retrieved documentation does not need more.
 *
 * A specific version, not `gemini-flash-latest`. The prompt this model is
 * given is load-bearing - it is what stops the assistant describing modelled
 * P&L as profit - and an alias that silently repoints to a new model is a
 * silent change to how reliably those rules are followed. Upgrades should be
 * a commit somebody reviewed.
 */
const MODEL = 'gemini-3.6-flash';

/** Placeholder values shipped in .env.example, which must not count as configured. */
function isPlaceholder(key: string): boolean {
  const k = key.trim().toLowerCase();
  return k === '' || k.startsWith('your') || k.includes('_here') || k.includes('xxx');
}

function readKey(env: NodeJS.ProcessEnv): string | null {
  const key = (env.GEMINI_API_KEY ?? '').trim();
  return isPlaceholder(key) ? null : key;
}

/**
 * Retry only what retrying can fix.
 *
 * A 400 means the request was wrong and will be wrong again; a 403 means the
 * key is not accepted. Repeating either wastes the user's monthly allowance
 * on a certainty. Rate limits, 5xx and connection failures are the transient
 * cases, and on the free tier 429 is the one most likely to be hit.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Node reports DNS and connection failures from fetch as a bare TypeError. */
function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.message === 'fetch failed');
}

const RETRY_DELAYS_MS = [400, 1200];

export class GeminiProvider implements CopilotModelProvider {
  private readonly key: string | null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.key = readKey(env);
  }

  isConfigured(): boolean {
    return this.key !== null;
  }

  /**
   * One call, plus up to two retries on transient failure.
   *
   * Added after a live request died on `fetch failed` - a DNS blip, not an API
   * error - and surfaced to the user as "I couldn't reach Panoply's
   * assistant". The machine this runs on has dropped name resolution for
   * several hosts intermittently, and a single lost lookup should not spend a
   * question from a monthly allowance of two.
   *
   * Aborts are never retried: if the caller cancelled, retrying is the one
   * thing it asked not to happen.
   */
  private async fetchWithRetry(body: unknown, signal?: AbortSignal): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
      }
      try {
        const response = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${this.key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
          cache: 'no-store',
        });
        if (!isRetryableStatus(response.status)) return response;
        lastError = new Error(`Gemini responded ${response.status}`);
      } catch (error) {
        if (signal?.aborted) throw error;
        if (!isNetworkError(error)) throw error;
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Gemini request failed.');
  }

  async complete(input: {
    system: string;
    turns: CopilotTurn[];
    signal?: AbortSignal;
  }): Promise<string> {
    if (!this.key) throw new Error('Gemini is not configured.');

    /*
     * The system prompt goes in `systemInstruction`, not as a first user turn.
     * Folding it into the conversation would leave it sitting in history where
     * a later message could argue with it as though it were something the user
     * had said; as a system instruction it stays outside the dialogue.
     */
    const body = {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: input.turns.map((t) => ({
        role: t.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: t.content }],
      })),
      generationConfig: {
        temperature: 0.3, // Support answers should be repeatable, not creative.
        maxOutputTokens: 800,
      },
    };

    const response = await this.fetchWithRetry(body, input.signal);

    if (!response.ok) {
      /*
       * The upstream body can echo the API key back in an error. It is read
       * for the status line only and never returned to the caller, who gets a
       * generic failure that the route turns into a generic message.
       */
      throw new Error(`Gemini responded ${response.status}`);
    }

    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();

    // A blocked or empty completion is a failure, not an empty reply: showing
    // a blank assistant bubble would read as the assistant ignoring the user.
    if (!text) throw new Error('Gemini returned no usable content.');
    return text;
  }
}

/** Swappable at the seam. Everything above the service sees only the interface. */
export function getModelProvider(env: NodeJS.ProcessEnv = process.env): CopilotModelProvider {
  return new GeminiProvider(env);
}
