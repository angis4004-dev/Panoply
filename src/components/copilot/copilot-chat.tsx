'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ArrowUp, Check, Copy, LifeBuoy, Mic, Sparkles, TriangleAlert } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { SupportForm } from '@/components/copilot/support-form';

/**
 * Ask Panoply — the conversation itself.
 *
 * One component, two homes: the full page at /dashboard/ai and the gesture
 * sheet that opens over any other dashboard page. They are the same element
 * with a different frame around it, which is the only way the two can be
 * guaranteed not to drift — a second implementation of this would eventually
 * grow a different disclaimer, or a different escalation path, and one of the
 * two would be the wrong one.
 *
 * Nothing in the transcript is canned. Every word came back from /api/copilot
 * or is an error state.
 */

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  /** Marks a turn that is an error rather than an answer, so it renders as one. */
  failed?: boolean;
  /** Set when the failure is one a person can fix, so support is offered. */
  offerSupport?: boolean;
}

/**
 * Starting points, phrased as things the docs can actually answer.
 *
 * Deliberately no "how is my portfolio doing?" style prompt that invites a
 * performance figure as the very first exchange. The assistant handles those
 * correctly, but the opening screen should not lead with the one topic that
 * needs a disclaimer attached to every sentence.
 */
const SUGGESTIONS = [
  'How do deposits work?',
  'What is a Signal Flow?',
  'What is the difference between Vaults and Yield?',
  'How do I complete identity verification?',
  'How do the tiers work?',
  'How does the 6-digit PIN security work?',
];

const MAX_CHARS = 2000;

export function CopilotChat({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /** The last thing the user actually asked, carried into a support ticket. */
  const lastQuestion = [...turns].reverse().find((t) => t.role === 'user')?.content;

  // Keep the newest turn in view. Only when turns change, so it does not fight
  // a user who has scrolled up to reread something while a reply lands.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, supportOpen]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;

      /*
       * History is captured before the optimistic turn is appended. Sending
       * the user's own new message inside `history` as well as `message` would
       * show it to the model twice.
       */
      const history = turns
        .filter((t) => !t.failed)
        .map((t) => ({ role: t.role, content: t.content }));

      setTurns((prev) => [...prev, { role: 'user', content: message }]);
      setDraft('');
      setBusy(true);

      try {
        const response = await fetch('/api/copilot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history, mode: 'text', context: { pathname } }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          /*
           * 403 and 429 are the two failures a person can actually resolve —
           * an ineligible tier and a spent allowance. Both leave the user with
           * a question and no way to ask it, which is precisely when the
           * escalation should be in front of them rather than a click away.
           */
          setTurns((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: payload.error ?? "I couldn't answer that just now. Please try again.",
              failed: true,
              offerSupport: response.status === 403 || response.status === 429,
            },
          ]);
          return;
        }

        setTurns((prev) => [
          ...prev,
          { role: 'assistant', content: payload.content, sources: payload.sources ?? [] },
        ]);
        setRemaining(payload.remaining ?? null);
      } catch {
        setTurns((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Could not reach the server. Check your connection and try again.',
            failed: true,
          },
        ]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, turns, pathname]
  );

  const empty = turns.length === 0;

  return (
    // Both variants fill whatever their frame gives them: the page sets the
    // page height, the sheet sets the sheet height. min-h-0 is what lets the
    // transcript scroll inside a flex column instead of pushing the composer
    // off the bottom.
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Transcript. aria-live so a screen reader hears replies as they land;
          voice is an additional interface here, never the only one. */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto p-4 sm:p-6 ${
          compact ? '' : 'rounded-xl border border-ds-border bg-ds-surface-raised/40'
        }`}
      >
        {empty && !supportOpen ? (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-ds-text">How can I help you today?</h2>
            <p className="mt-1.5 max-w-md text-sm text-ds-text-muted">
              Ask about deposits, verification, Signal Flows, Vaults or anything else on Panoply.
            </p>

            <div className="mt-6 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  disabled={busy}
                  className="rounded-lg border border-ds-border p-3 text-left text-xs font-medium text-ds-text-secondary transition-colors duration-fast ease-ds-out disabled:opacity-50 [@media(hover:hover)_and_(pointer:fine)]:hover:border-primary/40 [@media(hover:hover)_and_(pointer:fine)]:hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div aria-live="polite" className="flex flex-col gap-5">
            {turns.map((turn, i) => (
              <Message key={i} turn={turn} onEscalate={() => setSupportOpen(true)} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-ds-text-muted">
                <Loader size={14} />
                <span>Thinking…</span>
              </div>
            )}
          </div>
        )}

        {supportOpen && (
          <div className="mt-5">
            <SupportForm
              pathname={pathname}
              lastQuestion={lastQuestion}
              onDone={() => setSupportOpen(false)}
              onCancel={() => setSupportOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Composer. One control for both interfaces — the user never picks a
          "mode", they either type or press the microphone. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
        className={compact ? 'shrink-0 border-t border-ds-border p-3' : 'mt-4'}
      >
        <div className="flex items-end gap-2 rounded-xl border border-ds-border bg-ds-surface-raised p-2 focus-within:border-primary/40">
          <label htmlFor="copilot-input" className="sr-only">
            Ask Panoply anything
          </label>
          <textarea
            id="copilot-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MAX_CHARS}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter breaks the line.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            placeholder="Ask Panoply anything…"
            disabled={busy}
            className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-ds-text placeholder:text-ds-text-muted focus:outline-none disabled:opacity-50"
          />

          {/*
            The microphone is present and honestly disabled rather than hidden.
            Voice was deferred on cost — a realtime provider runs roughly
            $0.15-0.30 a minute — and the service, route and VoiceProvider
            interface are all built to accept it. A hidden control would make
            the feature look unplanned; a disabled one with a reason reads as a
            decision, which it was.
          */}
          <button
            type="button"
            disabled
            title="Voice input is not enabled yet"
            aria-label="Voice input (not enabled yet)"
            className="flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-lg text-ds-text-muted opacity-40"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="submit"
            disabled={busy || draft.trim().length === 0}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform duration-fast ease-ds-out disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
          >
            {busy ? <Loader size={16} /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
          <p className="max-w-prose flex-1 text-[11px] leading-relaxed text-ds-text-muted">
            Ask Panoply explains the platform and your account. It cannot make investment
            recommendations or move funds, and signal flow figures it quotes come from
            Panoply&apos;s performance model rather than executed trades.
            {remaining !== null && (
              <>
                {' '}
                <span className="text-ds-text-secondary">
                  {remaining} question{remaining === 1 ? '' : 's'} left this month.
                </span>
              </>
            )}
          </p>

          {/* Always reachable, not only after a failure. Somebody who already
              knows they need a person should not have to ask a robot first. */}
          {!supportOpen && (
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded text-[11px] text-ds-text-muted underline-offset-2 transition-colors duration-fast ease-ds-out [@media(hover:hover)_and_(pointer:fine)]:hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <LifeBuoy className="h-3 w-3" aria-hidden="true" />
              Talk to a person
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!text || copied) return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied to clipboard' : 'Copy message'}
      aria-label={copied ? 'Copied to clipboard' : 'Copy message'}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ds-text-muted transition-colors duration-fast ease-ds-out [@media(hover:hover)_and_(pointer:fine)]:hover:bg-ds-surface-inset [@media(hover:hover)_and_(pointer:fine)]:hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />
          <span className="text-emerald-500">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" aria-hidden="true" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

function Message({ turn, onEscalate }: { turn: Turn; onEscalate: () => void }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary/10 px-3.5 py-2.5 text-sm text-ds-text">
          {turn.content}
        </div>
      </div>
    );
  }

  if (turn.failed) {
    return (
      <div className="rounded-lg border border-ds-value-warning/30 bg-ds-value-warning/5 px-3.5 py-2.5">
        <div className="flex items-start gap-2">
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-ds-value-warning"
            aria-hidden="true"
          />
          <p className="text-sm text-ds-text-secondary">
            {turn.content} {/* Ineligible users get the one link that actually unblocks them. */}
            {turn.content.includes('identity verification') && (
              <Link href="/dashboard/kyc" className="underline underline-offset-2">
                Verify now
              </Link>
            )}
          </p>
        </div>

        {turn.offerSupport && (
          <button
            type="button"
            onClick={onEscalate}
            className="mt-2.5 ml-6 flex items-center gap-1.5 rounded-lg border border-ds-border px-3 py-1.5 text-sm text-ds-text-secondary transition-colors duration-fast ease-ds-out [@media(hover:hover)_and_(pointer:fine)]:hover:border-primary/40 [@media(hover:hover)_and_(pointer:fine)]:hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
            Message a person instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[95%]">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ds-text">{turn.content}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {turn.sources && turn.sources.length > 0 ? (
          <p className="text-[11px] text-ds-text-muted">
            Based on:{' '}
            {turn.sources.map((s) => s.replace(/^Panoply — what it is — ?/, '')).join(', ')}
          </p>
        ) : (
          <div />
        )}
        <CopyButton text={turn.content} />
      </div>
    </div>
  );
}
