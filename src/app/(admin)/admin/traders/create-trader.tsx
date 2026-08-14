'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const FIELD =
  'w-full rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-label text-ds-text outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/40';

/**
 * Create a trader account.
 *
 * The password is generated server-side and returned once. It is shown here
 * until the operator dismisses the panel and cannot be retrieved afterwards -
 * which is the point. An operator inventing a password for somebody else picks
 * the same one every time, and it never gets changed.
 */
export function CreateTrader() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<{ email: string; password: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/admin/traders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The account was not created.');
        return;
      }
      setIssued({ email: payload.trader.email, password: payload.initialPassword });
      setName('');
      setEmail('');
      router.refresh();
    } catch {
      toast.error('Unable to reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <div className="w-80 space-y-2 rounded border border-ds-value-positive/30 bg-ds-value-positive/[0.07] p-3 text-ds-caption">
        <p className="font-semibold text-ds-value-positive">Account created</p>
        <p className="text-ds-value-positive/80">
          Give these to {issued.email} over a channel you trust. This password is not stored and
          cannot be shown again.
        </p>
        <code className="block break-all rounded bg-ds-surface-inset px-2 py-1 font-mono text-ds-text">
          {issued.password}
        </code>
        <button
          type="button"
          onClick={() => {
            setIssued(null);
            setOpen(false);
          }}
          className="rounded border border-ds-value-positive/30 px-2 py-1 text-ds-value-positive hover:bg-ds-value-positive/15"
        >
          Done
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-primary px-3 py-1.5 text-ds-label font-semibold tracking-normal text-primary-foreground hover:bg-primary/90"
      >
        New trader
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-80 space-y-2 rounded border border-ds-border-strong bg-ds-surface-overlay p-3"
    >
      <label className="block text-ds-caption text-ds-text-muted">
        Name
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`${FIELD} mt-0.5`}
        />
      </label>
      <label className="block text-ds-caption text-ds-text-muted">
        Email
        <input
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`${FIELD} mt-0.5`}
        />
      </label>
      <div className="flex gap-1 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded bg-primary px-2 py-1 text-ds-caption font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create'}
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
