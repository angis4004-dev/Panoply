'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const FIELD =
  'w-full rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-caption text-ds-text outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/40';

/** Suspend, reactivate, or re-permission one Admin. */
export function AdminControls({
  adminId,
  status,
  granted,
  grantable,
}: {
  adminId: string;
  status: string;
  granted: string[];
  grantable: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [permissions, setPermissions] = React.useState<string[]>(granted);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const suspended = status === 'suspended';

  function toggle(permission: string) {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission]
    );
  }

  async function send(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/admins/${adminId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The change was not applied.');
        return;
      }
      toast.success(success);
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
        Manage
      </button>
    );
  }

  return (
    <div className="w-80 space-y-2 rounded border border-ds-border-strong bg-ds-surface-overlay p-2">
      <fieldset className="rounded border border-ds-border p-2">
        <legend className="px-1 text-ds-caption text-ds-text-muted">Additional permissions</legend>
        <div className="grid grid-cols-1 gap-1">
          {grantable.map((permission) => (
            <label
              key={permission}
              className="flex items-center gap-1.5 text-ds-caption text-ds-text-secondary"
            >
              <input
                type="checkbox"
                checked={permissions.includes(permission)}
                onChange={() => toggle(permission)}
                className="h-3 w-3 rounded border-ds-border-strong bg-ds-surface-raised"
              />
              <span className="font-mono">{permission}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        disabled={busy}
        onClick={() => send({ permissions }, 'Permissions updated.')}
        className="w-full rounded bg-primary px-2 py-1 text-ds-caption font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        Save permissions
      </button>

      <hr className="border-ds-border" />

      <label className="block text-ds-caption text-ds-text-muted">
        Reason {!suspended && <span className="text-ds-value-warning">(required to suspend)</span>}
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={`${FIELD} mt-0.5`}
        />
      </label>

      {suspended ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            send({ status: 'active', reason: reason.trim() || undefined }, 'Reactivated.')
          }
          className="w-full rounded bg-ds-value-positive/15 px-2 py-1 text-ds-caption font-semibold text-ds-value-positive hover:bg-ds-value-positive/25 disabled:opacity-50"
        >
          Reactivate
        </button>
      ) : (
        <button
          type="button"
          disabled={busy || !reason.trim()}
          onClick={() =>
            send({ status: 'suspended', reason: reason.trim() }, 'Suspended and signed out.')
          }
          className="w-full rounded bg-ds-value-negative/15 px-2 py-1 text-ds-caption font-semibold text-ds-value-negative hover:bg-ds-value-negative/25 disabled:opacity-50"
        >
          Suspend and end all sessions
        </button>
      )}

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="w-full rounded border border-ds-border-strong px-2 py-1 text-ds-caption text-ds-text-secondary"
      >
        Close
      </button>
    </div>
  );
}
