'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const FIELD =
  'w-full rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-caption text-ds-text outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/40';

/**
 * A manual balance correction.
 *
 * The balance the operator is looking at is sent with the request. If it has
 * moved since the page rendered - a deposit authorized in another tab, a bot
 * allocating capital - the server refuses rather than applying the change on
 * top. That is a 409 the operator has to read and redo deliberately, which is
 * the correct outcome: the figure they decided on was for a different account
 * state.
 */
export function BalanceAdjustment({
  traderId,
  currentBalanceMinor,
}: {
  traderId: string;
  currentBalanceMinor: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [target, setTarget] = React.useState((currentBalanceMinor / 100).toFixed(2));
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const targetMinor = Math.round(Number(target) * 100);
  const delta = Number.isFinite(targetMinor) ? targetMinor - currentBalanceMinor : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!Number.isSafeInteger(targetMinor) || targetMinor < 0) {
      toast.error('Enter the new balance as a number, for example 1250.00');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/traders/${traderId}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetBalanceMinor: targetMinor,
          expectedBalanceMinor: currentBalanceMinor,
          reason: reason.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The adjustment was not applied.');
        if (response.status === 409) router.refresh();
        return;
      }
      toast.success(
        payload.noop ? 'No change - the balance already matched.' : 'Adjustment posted.'
      );
      setOpen(false);
      setReason('');
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
        Adjust balance
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-72 space-y-2 rounded border border-ds-border-strong bg-ds-surface-overlay p-2"
    >
      <p className="text-ds-caption text-ds-text-muted">
        Posts a ledger entry. The balance field itself is never written directly.
      </p>

      <label className="block text-ds-caption text-ds-text-muted">
        New balance (USD)
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          inputMode="decimal"
          className={`${FIELD} mt-0.5 font-mono`}
        />
      </label>

      <p className="text-ds-caption text-ds-text-muted">
        Entry:{' '}
        <span
          className={
            delta < 0 ? 'font-mono text-ds-value-negative' : 'font-mono text-ds-value-positive'
          }
        >
          {delta === 0 ? 'none' : `${delta < 0 ? '−' : '+'}$${(Math.abs(delta) / 100).toFixed(2)}`}
        </span>
      </p>

      <label className="block text-ds-caption text-ds-text-muted">
        Reason (required, recorded permanently)
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          className={`${FIELD} mt-0.5`}
        />
      </label>

      <div className="flex gap-1 pt-1">
        <button
          type="submit"
          disabled={busy || reason.trim().length < 8}
          title={reason.trim().length < 8 ? 'Explain the adjustment first' : undefined}
          className="flex-1 rounded bg-primary px-2 py-1 text-ds-caption font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? 'Posting…' : 'Post adjustment'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-ds-border-strong px-2 py-1 text-ds-caption text-ds-text-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
