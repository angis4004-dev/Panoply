/**
 * Shared contracts for Panoply Copilot.
 *
 * Text and voice are two front ends onto one assistant. Everything they both
 * need is declared here so neither can drift into its own dialect: a voice
 * turn and a typed turn produce the same `CopilotTurn`, and the service
 * cannot tell which one it came from.
 */

/** Who produced a turn. `system` never leaves the server. */
export type CopilotRole = 'user' | 'assistant';

/** How the user submitted a turn. Recorded for display, never for routing. */
export type CopilotInputMode = 'text' | 'voice';

export interface CopilotTurn {
  role: CopilotRole;
  content: string;
  /**
   * Present on user turns only. The assistant does not behave differently for
   * spoken input - this exists so the transcript can show a microphone icon
   * beside something that was said rather than typed.
   */
  mode?: CopilotInputMode;
}

/**
 * Where the user was standing when they asked.
 *
 * Deliberately just a route label. An earlier draft passed the page's loaded
 * data along with it, which would have shipped balances and positions to the
 * model on every request whether or not the question needed them. The tools
 * exist for that, and they run only when the model actually asks.
 */
export interface CopilotPageContext {
  /** e.g. '/dashboard/bots'. Mapped to a human label before it reaches the model. */
  pathname?: string;
}

export interface CopilotRequest {
  message: string;
  /** Prior turns in this conversation. Trimmed server-side before use. */
  history: CopilotTurn[];
  mode: CopilotInputMode;
  context?: CopilotPageContext;
}

/** A documentation excerpt selected by retrieval. */
export interface RetrievedChunk {
  /** Human-readable origin, e.g. 'Security' or 'Panoply overview'. */
  source: string;
  text: string;
  /** Cosine similarity to the query, 0-1. Kept for debugging and thresholds. */
  score: number;
}

export interface CopilotReply {
  content: string;
  /** Which documents informed the answer, for display under the reply. */
  sources: string[];
  /** Quota remaining after this call. Null when the tier is uncapped. */
  remaining: number | null;
}

/**
 * Why a request was refused before it ever reached the model.
 *
 * Separated from a generic error because each of these has a different, and
 * useful, thing to tell the user - "you are out of questions this month" and
 * "the assistant is not configured" are not the same problem and must not
 * render as the same message.
 */
export type CopilotRefusal =
  | { reason: 'unauthenticated' }
  | { reason: 'not_configured' }
  | { reason: 'tier_ineligible'; tier: string }
  | { reason: 'quota_exhausted'; limit: number; resetsAt: string }
  | { reason: 'empty_message' }
  | { reason: 'upstream_failed' };

export type CopilotResult =
  { ok: true; reply: CopilotReply } | { ok: false; refusal: CopilotRefusal };

/**
 * The model behind the assistant.
 *
 * An interface rather than a direct call so the provider can be swapped
 * without touching the service, the route or the UI - the project carries
 * keys for three vendors and only one is wired.
 */
export interface CopilotModelProvider {
  /** False when no usable credential is present. Checked before every call. */
  isConfigured(): boolean;
  complete(input: { system: string; turns: CopilotTurn[]; signal?: AbortSignal }): Promise<string>;
}

/**
 * The voice interface, declared now and implemented later.
 *
 * Voice was deferred on cost: a realtime provider runs roughly $0.15-0.30 per
 * minute of conversation, which the current budget cannot absorb. The
 * boundary is defined anyway so adding it later is an implementation of this
 * interface plus a UI control, not a rewrite of the assistant.
 *
 * Note what is absent: there is no `ask()` here. Voice must not acquire its
 * own path to the model. It transcribes to text, hands that to the same
 * service the composer uses, and speaks whatever comes back.
 */
export interface VoiceProvider {
  isConfigured(): boolean;
  /** Microphone audio to text. Resolves with the final transcript. */
  transcribe(audio: Blob, signal?: AbortSignal): Promise<string>;
  /** Assistant text to speech. */
  speak(text: string, signal?: AbortSignal): Promise<void>;
  /** Stop playback immediately, for the interrupt control. */
  stop(): void;
}
