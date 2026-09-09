'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { fieldClass } from '@/components/admin-console/primitives';

/**
 * Answer one ticket.
 *
 * The reply is delivered as a notification, in full, and there is no thread
 * for the trader to open and read it in - so the composer says so. An operator
 * who thinks they are writing into a chat will write "see above", and nobody
 * will see above.
 *
 * "Send and close" is the primary action because most support answers end the
 * matter; plain "Send" is there for the ones that will need a second round.
 */
export function TicketReply({ ticketId, reference }: { ticketId: string; reference: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/support/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? 'The reply was not sent.');
        return;
      }
      toast.success(success);
      setBody('');
      setOpen(false);
      router.refresh();
    } catch {
      toast.error('Unable to reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1 text-ds-caption text-ds-text hover:bg-ds-surface-overlay"
      >
        Answer
      </button>
    );
  }

  const empty = body.trim().length < 2;

  return (
    <div className="w-80 space-y-2 rounded border border-ds-border-strong bg-ds-surface-overlay p-2">
      <label className="block text-ds-caption text-ds-text-muted">
        Reply to {reference} — sent to the trader&apos;s notifications, in full
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          maxLength={4000}
          autoFocus
          placeholder="Write the complete answer. The trader sees only this."
          className={`${fieldClass} mt-0.5`}
        />
      </label>

      <div className="flex gap-1">
        <button
          type="button"
          disabled={busy || empty}
          onClick={() => submit({ action: 'reply', body: body.trim(), close: true }, 'Answered.')}
          className="flex-1 rounded bg-ds-value-positive/15 px-2 py-1 text-ds-caption font-semibold text-ds-value-positive hover:bg-ds-value-positive/25 disabled:opacity-40"
        >
          Send and close
        </button>
        <button
          type="button"
          disabled={busy || empty}
          onClick={() =>
            submit({ action: 'reply', body: body.trim(), close: false }, 'Reply sent.')
          }
          className="rounded border border-ds-border-strong px-2 py-1 text-ds-caption text-ds-text hover:bg-ds-surface-inset disabled:opacity-40"
        >
          Send
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-ds-border-strong px-2 py-1 text-ds-caption text-ds-text-secondary"
        >
          Close
        </button>
      </div>

      {/* Closing without an answer sends nothing. Separated from the two send
          buttons so it cannot be hit while reaching for them. */}
      <button
        type="button"
        disabled={busy}
        onClick={() => submit({ action: 'close' }, 'Closed without a reply.')}
        className="w-full rounded px-2 py-1 text-ds-caption text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text disabled:opacity-40"
      >
        Close without replying
      </button>
    </div>
  );
}
