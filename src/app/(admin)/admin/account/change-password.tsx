'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const FIELD =
  'w-full rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-label text-ds-text outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/40';

export function ChangePassword() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/admin/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The password was not changed.');
        return;
      }
      toast.success('Password changed. Other sessions have been signed out.');
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
      // The server issued a fresh cookie for this device; refresh so the
      // console re-reads the account and drops the setup banner.
      router.refresh();
      router.replace('/admin');
    } catch {
      toast.error('Unable to reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-ds-caption text-ds-text-muted">
        Current password
        <input
          required
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className={`${FIELD} mt-0.5`}
        />
      </label>
      <label className="block text-ds-caption text-ds-text-muted">
        New password
        <input
          required
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={`${FIELD} mt-0.5`}
        />
        <span className="mt-0.5 block text-ds-caption text-ds-text-muted">
          At least 14 characters, mixing three of: lowercase, uppercase, digits, symbols.
        </span>
      </label>
      <label className="block text-ds-caption text-ds-text-muted">
        Confirm new password
        <input
          required
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={`${FIELD} mt-0.5`}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-primary px-3 py-1.5 text-ds-label font-semibold tracking-normal text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {busy ? 'Changing…' : 'Change password'}
      </button>
    </form>
  );
}
