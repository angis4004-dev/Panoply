'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const FIELD =
  'w-full rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-label text-ds-text outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/40';

/**
 * Create an Admin.
 *
 * There is no role selector. MainAdmin is not a role this form can produce -
 * the server refuses it, the schema has no field for it, and the permission
 * model refuses it a third time. The only options here are which grantable
 * permissions the new account starts with.
 */
export function CreateAdmin({ grantable }: { grantable: string[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [permissions, setPermissions] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<{ email: string; password: string } | null>(null);

  function toggle(permission: string) {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((value) => value !== permission)
        : [...current, permission]
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, permissions }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The admin was not created.');
        return;
      }
      setIssued({ email: payload.admin.email, password: payload.initialPassword });
      setName('');
      setEmail('');
      setPermissions([]);
      router.refresh();
    } catch {
      toast.error('Unable to reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <div className="w-96 space-y-2 rounded border border-ds-value-positive/30 bg-ds-value-positive/[0.07] p-3 text-ds-caption">
        <p className="font-semibold text-ds-value-positive">Admin created</p>
        <p className="text-ds-value-positive/80">
          Give this to {issued.email} over a channel you trust. They must change it and choose a PIN
          on their first sign-in. It is not stored and cannot be shown again.
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
        New admin
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-96 space-y-2 rounded border border-ds-border-strong bg-ds-surface-overlay p-3"
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

      <fieldset className="rounded border border-ds-border p-2">
        <legend className="px-1 text-ds-caption text-ds-text-muted">Additional permissions</legend>
        <p className="mb-1 text-ds-caption text-ds-text-muted">
          Every Admin can already read traders, review KYC, and read the audit log. Tick only what
          this person needs beyond that.
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
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

      <div className="flex gap-1 pt-1">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded bg-primary px-2 py-1 text-ds-caption font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create admin'}
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
