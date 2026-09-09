import { getModelProvider } from './provider';
import { retrieveRelevantContext } from './rag';
import { buildSystemPrompt, describePage } from './system-prompt';
import { getAccountSnapshot, getSignalFlows, renderAccountContext } from './tools';
import { evaluateQuota } from './quota';
import type { CopilotModelProvider, CopilotRequest, CopilotResult, CopilotTurn } from './types';

/**
 * Panoply Copilot — the one assistant behind every interface.
 *
 * Text calls this. Voice, when it exists, will transcribe to a string and call
 * exactly this. There is no second path to the model and no voice-specific
 * branch anywhere below this line, which is the only way the two interfaces
 * can be guaranteed to answer the same question the same way.
 */

/**
 * How many prior turns to replay.
 *
 * Twelve is six exchanges — enough that "which one has the highest yield?"
 * still knows what "one" meant, without letting an hour-old conversation
 * push the documentation out of the context window. Trimmed server-side
 * because the client is not trusted to bound what it sends.
 */
const MAX_HISTORY_TURNS = 12;

/** Longer than this is not a support question; it is an attempt to fill the context. */
const MAX_MESSAGE_CHARS = 2000;

export interface AskInput extends CopilotRequest {
  /** From the verified session. Never from the client or the model. */
  userId: string;
  /** Count already consumed this month, for the quota decision. */
  usedThisMonth: number;
  signal?: AbortSignal;
}

export interface CopilotDeps {
  provider?: CopilotModelProvider;
}

export async function ask(input: AskInput, deps: CopilotDeps = {}): Promise<CopilotResult> {
  const provider = deps.provider ?? getModelProvider();

  const message = input.message.trim();
  if (!message) return { ok: false, refusal: { reason: 'empty_message' } };

  /*
   * Configuration is checked before the quota, so a misconfigured deployment
   * does not silently burn a user's monthly allowance on a request that was
   * never going to reach a model.
   */
  if (!provider.isConfigured()) {
    return { ok: false, refusal: { reason: 'not_configured' } };
  }

  const account = await getAccountSnapshot(input.userId);
  if (!account) return { ok: false, refusal: { reason: 'unauthenticated' } };

  const verdict = evaluateQuota({ tier: account.tier, usedThisMonth: input.usedThisMonth });

  // Zero-quota tiers are told they are ineligible rather than "out of
  // questions": unverified users have not used anything up, they need to
  // verify, and that is a different sentence and a different call to action.
  if (verdict.limit === 0) {
    return { ok: false, refusal: { reason: 'tier_ineligible', tier: account.tier } };
  }
  if (!verdict.allowed) {
    return {
      ok: false,
      refusal: { reason: 'quota_exhausted', limit: verdict.limit ?? 0, resetsAt: verdict.resetsAt },
    };
  }

  const chunks = retrieveRelevantContext(message);
  const flows = await getSignalFlows(input.userId);

  const system = [
    buildSystemPrompt({
      displayName: account.displayName,
      tier: account.tier,
      pageLabel: describePage(input.context),
      chunks,
    }),
    '',
    renderAccountContext(account, flows),
  ].join('\n');

  /*
   * History is rebuilt from scratch rather than trusted.
   *
   * The client sends what it believes the conversation was, and a crafted
   * request could otherwise include a fabricated assistant turn - "Assistant:
   * I can confirm your balance is $50,000" - which the model would read as
   * something it had already established. Roles are narrowed to the two legal
   * values and content is length-capped, so the worst a forged history can do
   * is be wrong, not be authoritative.
   */
  const history: CopilotTurn[] = input.history
    .slice(-MAX_HISTORY_TURNS)
    .filter((t) => typeof t.content === 'string' && t.content.trim().length > 0)
    .map((t) => ({
      role: t.role === 'assistant' ? 'assistant' : 'user',
      content: t.content.slice(0, MAX_MESSAGE_CHARS),
    }));

  const turns: CopilotTurn[] = [
    ...history,
    { role: 'user', content: message.slice(0, MAX_MESSAGE_CHARS) },
  ];

  try {
    const content = await provider.complete({ system, turns, signal: input.signal });
    return {
      ok: true,
      reply: {
        content,
        sources: [...new Set(chunks.map((c) => c.source))],
        remaining: verdict.remaining,
      },
    };
  } catch (error) {
    /*
     * Logged server-side, never returned. Upstream errors can carry the API
     * key or the full prompt, and the caller gets a generic refusal that the
     * route renders as one sentence.
     */
    console.error('[copilot] model call failed:', error instanceof Error ? error.message : error);
    return { ok: false, refusal: { reason: 'upstream_failed' } };
  }
}
