'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader } from '@/components/ui/loader';

const FIELD =
  'w-full rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-caption text-ds-text outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/40';

/** Edit a trader's profile, or suspend and reactivate the account. */
export function TraderControls({
  traderId,
  status,
  riskProfile,
  notes,
  canSuspend,
}: {
  traderId: string;
  status: string;
  riskProfile: string;
  notes: string;
  canSuspend: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ status, riskProfile, notes, reason: '' });
  const [busy, setBusy] = React.useState(false);

  const suspending = form.status === 'suspended' && status !== 'suspended';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, unknown> = { reason: form.reason.trim() || undefined };
      if (form.riskProfile !== riskProfile) body.riskProfile = form.riskProfile;
      if (form.notes !== notes) body.notes = form.notes;
      if (form.status !== status) body.status = form.status;

      const response = await fetch(`/api/admin/traders/${traderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The change was not saved.');
        return;
      }
      toast.success('Saved.');
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
        className="rounded border border-ds-border-strong bg-ds-surface-inset px-3 py-1.5 text-ds-label text-ds-text hover:bg-ds-surface-overlay"
      >
        Edit account
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-80 space-y-2 rounded border border-ds-border-strong bg-ds-surface-overlay p-3"
    >
      <label className="block text-ds-caption text-ds-text-muted">
        Risk profile
        <select
          value={form.riskProfile}
          onChange={(event) => setForm({ ...form, riskProfile: event.target.value })}
          className={`${FIELD} mt-0.5`}
        >
          <option>Conservative</option>
          <option>Balanced</option>
          <option>Aggressive</option>
        </select>
      </label>

      <label className="block text-ds-caption text-ds-text-muted">
        Status
        <select
          value={form.status}
          disabled={!canSuspend}
          onChange={(event) => setForm({ ...form, status: event.target.value })}
          className={`${FIELD} mt-0.5 disabled:opacity-50`}
        >
          <option value="active">Active</option>
          <option value="onboarding">Onboarding</option>
          <option value="flagged">Flagged</option>
          <option value="suspended">Suspended</option>
        </select>
        {!canSuspend && (
          <span className="mt-0.5 block text-ds-caption text-ds-text-muted">
            Changing status needs trader.suspend.
          </span>
        )}
      </label>

      <label className="block text-ds-caption text-ds-text-muted">
        Internal notes
        <textarea
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          rows={3}
          className={`${FIELD} mt-0.5`}
        />
      </label>

      <label className="block text-ds-caption text-ds-text-muted">
        Reason {suspending && <span className="text-ds-value-warning">(required to suspend)</span>}
        <input
          value={form.reason}
          onChange={(event) => setForm({ ...form, reason: event.target.value })}
          className={`${FIELD} mt-0.5`}
        />
      </label>

      {suspending && (
        <p className="rounded border border-ds-value-warning/30 bg-ds-value-warning/[0.07] px-2 py-1 text-ds-caption text-ds-value-warning">
          Suspending signs this trader out of every device immediately.
        </p>
      )}

      <div className="flex gap-1 pt-1">
        <button
          type="submit"
          disabled={busy || (suspending && !form.reason.trim())}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-primary px-2 py-1 text-ds-caption font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy && <Loader size={14} />}
          {busy ? 'Saving…' : 'Save'}
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
