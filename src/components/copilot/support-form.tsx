'use client';

import { useState } from 'react';
import { CheckCircle2, LifeBuoy } from 'lucide-react';
import { Loader } from '@/components/ui/loader';

/**
 * The escalation: from the assistant to a person.
 *
 * Shown inside the conversation rather than on a separate page, because the
 * moment somebody needs a human is the moment they have just been told the
 * assistant cannot help — and sending them off to find a contact form is how
 * you lose them. The question they already asked travels with the ticket, so
 * they do not have to type it a second time.
 */

interface SupportFormProps {
  /** Where the user was when they escalated. Goes to the operator as context. */
  pathname: string;
  /** Their last question to the assistant, prefilled so nobody retypes it. */
  lastQuestion?: string;
  onDone: () => void;
  onCancel: () => void;
}

export function SupportForm({ pathname, lastQuestion, onDone, onCancel }: SupportFormProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(lastQuestion ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const valid = subject.trim().length >= 3 && body.trim().length >= 10;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          pathname,
          lastQuestion,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? 'We could not open your ticket. Please try again.');
        return;
      }
      setReference(payload.reference ?? null);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (reference) {
    return (
      <div className="rounded-xl border border-ds-value-positive/30 bg-ds-value-positive/[0.06] p-4">
        <div className="flex items-start gap-2.5">
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0 text-ds-value-positive"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium text-ds-text">
              Ticket <span className="font-mono">{reference}</span> is open.
            </p>
            {/* Says where the answer will arrive, because it does not arrive
                here. A promise of "we'll be in touch" with no channel named is
                how people end up checking an inbox that will stay empty. */}
            <p className="mt-1 text-sm text-ds-text-secondary">
              A person will read it and reply. Their answer arrives in your notifications — the bell
              in the header — so keep an eye there.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="mt-3 rounded-lg border border-ds-border px-3 py-1.5 text-sm text-ds-text-secondary transition-colors duration-fast ease-ds-out [@media(hover:hover)_and_(pointer:fine)]:hover:border-primary/40 [@media(hover:hover)_and_(pointer:fine)]:hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Back to the assistant
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-ds-border bg-ds-surface-raised/60 p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ds-text">Message a person</h3>
      </div>

      <label className="block text-sm text-ds-text-secondary">
        What is it about?
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={120}
          autoFocus
          placeholder="e.g. My deposit hasn't been credited"
          className="mt-1 w-full rounded-lg border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text placeholder:text-ds-text-muted focus:border-primary/40 focus:outline-none"
        />
      </label>

      <label className="mt-3 block text-sm text-ds-text-secondary">
        Tell us what happened
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Include anything that would help us find it — dates, amounts, what you expected."
          className="mt-1 w-full resize-none rounded-lg border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text placeholder:text-ds-text-muted focus:border-primary/40 focus:outline-none"
        />
      </label>

      {error && (
        <p className="mt-2 text-sm text-ds-value-negative" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={!valid || busy}
          className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-transform duration-fast ease-ds-out active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
        >
          {busy && <Loader size={14} />}
          Send to support
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm text-ds-text-muted transition-colors duration-fast ease-ds-out [@media(hover:hover)_and_(pointer:fine)]:hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
