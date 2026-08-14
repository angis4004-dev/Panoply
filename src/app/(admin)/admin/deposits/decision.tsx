'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/**
 * The authorize/reject control.
 *
 * Two things it deliberately does not do:
 *
 * It does not pre-fill the credit amount from what the trader declared. The
 * trader's figure is what they say they sent; the credit is what the operator
 * confirms is worth crediting, and pre-filling one with the other turns a
 * decision into a default.
 *
 * It does not trust its own disabled state. The button is disabled while a
 * request is in flight, but the server rejects a second decision on a
 * non-pending deposit regardless - two operators on two machines cannot be
 * coordinated by a React state variable.
 */

const FIELD =
  'w-full rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-caption text-ds-text outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/40';

export function DepositDecision({
  depositId,
  coin,
  network,
  assetAmount,
  txReference,
  address,
}: {
  depositId: string;
  coin: string;
  network: string;
  assetAmount: string;
  txReference: string;
  address: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'approve' | 'reject'>('approve');
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState(txReference);
  const [note, setNote] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    setBusy(true);
    try {
      const body =
        mode === 'approve'
          ? {
              action: 'approve',
              // Parsed to minor units here so the server receives an integer
              // and never has to guess whether "10.5" meant dollars or cents.
              creditAmountMinor: Math.round(Number(amount) * 100),
              txReference: reference.trim(),
              reviewNote: note.trim() || undefined,
            }
          : { action: 'reject', reason: reason.trim() };

      if (mode === 'approve' && !Number.isSafeInteger(body.creditAmountMinor as number)) {
        toast.error('Enter the credit amount as a number, for example 250.00');
        return;
      }

      const response = await fetch(`/api/admin/deposits/${depositId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(payload.error ?? 'The decision was not recorded.');
        // A 409 means someone else decided it. Refresh so the operator is
        // looking at the truth rather than at their own stale row.
        if (response.status === 409) router.refresh();
        return;
      }

      toast.success(
        mode === 'approve'
          ? `Credited. Wallet balance is now $${((payload.balanceMinor ?? 0) / 100).toFixed(2)}.`
          : 'Deposit rejected and the trader has been told.'
      );
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
        Review
      </button>
    );
  }

  return (
    <div className="w-72 space-y-2 rounded border border-ds-border-strong bg-ds-surface-overlay p-2">
      <div className="text-ds-caption leading-relaxed text-ds-text-muted">
        <div>
          {assetAmount} {coin} on {network}
        </div>
        <div className="break-all">to {address}</div>
      </div>

      <div className="flex gap-1">
        {(['approve', 'reject'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`flex-1 rounded px-2 py-1 text-ds-caption capitalize ${
              mode === value
                ? value === 'approve'
                  ? 'bg-ds-value-positive/20 text-ds-value-positive'
                  : 'bg-ds-value-negative/20 text-ds-value-negative'
                : 'bg-ds-surface-inset text-ds-text-secondary'
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {mode === 'approve' ? (
        <>
          <label className="block text-ds-caption text-ds-text-muted">
            Credit amount (USD)
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`${FIELD} mt-0.5 font-mono`}
            />
          </label>
          <label className="block text-ds-caption text-ds-text-muted">
            Transaction reference
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className={`${FIELD} mt-0.5 font-mono`}
            />
          </label>
          <label className="block text-ds-caption text-ds-text-muted">
            What you confirmed (optional)
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="6 confirmations on explorer"
              className={`${FIELD} mt-0.5`}
            />
          </label>
        </>
      ) : (
        <label className="block text-ds-caption text-ds-text-muted">
          Reason (shown to the trader)
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className={`${FIELD} mt-0.5`}
          />
        </label>
      )}

      <div className="flex gap-1 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="flex-1 rounded bg-primary px-2 py-1 text-ds-caption font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? 'Working…' : mode === 'approve' ? 'Authorize credit' : 'Reject'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-ds-border-strong px-2 py-1 text-ds-caption text-ds-text-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
