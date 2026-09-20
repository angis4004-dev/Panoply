'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, X } from 'lucide-react';
import {
  Note,
  Panel,
  buttonClass,
  fieldClass,
  labelClass,
} from '@/components/admin-console/primitives';

/**
 * Publish a deposit address.
 *
 * The address is typed in by the operator - it belongs to a custody wallet the
 * platform does not generate. Every trader sees it the moment this succeeds,
 * which is why the form says so rather than leaving the operator to infer the
 * blast radius from a screen that looks like any other create form.
 */
export function PublishAddress() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    coin: '',
    network: '',
    address: '',
    memoTag: '',
    label: '',
  });
  const [busy, setBusy] = React.useState(false);

  function set(field: keyof typeof form) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/admin/deposit-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coin: form.coin.trim(),
          network: form.network.trim(),
          address: form.address.trim(),
          memoTag: form.memoTag.trim() || undefined,
          label: form.label.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The address was not published.');
        return;
      }
      toast.success(`${form.coin.toUpperCase()} address published to all traders.`);
      setForm({ coin: '', network: '', address: '', memoTag: '', label: '' });
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
      <button type="button" onClick={() => setOpen(true)} className={buttonClass('primary')}>
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Publish address
      </button>
    );
  }

  return (
    <Panel className="w-full max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-ds-label font-semibold text-ds-text">Publish a deposit address</h3>
          <p className="mt-0.5 text-ds-caption font-normal tracking-normal text-ds-text-muted">
            Every trader will be shown this address for the coin and network below.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="rounded p-1 text-ds-text-muted transition-colors duration-fast ease-ds-out hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={submit} className="space-y-2.5">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <label htmlFor="publish-coin" className={labelClass}>
              Coin
            </label>
            <input
              id="publish-coin"
              required
              value={form.coin}
              onChange={set('coin')}
              placeholder="USDT"
              autoComplete="off"
              spellCheck={false}
              className={`${fieldClass} font-mono uppercase`}
            />
          </div>
          <div>
            <label htmlFor="publish-network" className={labelClass}>
              Network
            </label>
            <input
              id="publish-network"
              required
              value={form.network}
              onChange={set('network')}
              placeholder="TRC20"
              autoComplete="off"
              spellCheck={false}
              className={`${fieldClass} font-mono`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="publish-address" className={labelClass}>
            Wallet address
          </label>
          <input
            id="publish-address"
            required
            value={form.address}
            onChange={set('address')}
            autoComplete="off"
            spellCheck={false}
            className={`${fieldClass} font-mono`}
          />
          <p className="mt-1 text-ds-caption font-normal tracking-normal text-ds-text-muted">
            Paste it from the custody wallet. It cannot be edited afterwards — a wrong address is
            corrected by rotating, and anything already sent to it is gone.
          </p>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <label htmlFor="publish-memo" className={labelClass}>
              Memo / tag (optional)
            </label>
            <input
              id="publish-memo"
              value={form.memoTag}
              onChange={set('memoTag')}
              autoComplete="off"
              spellCheck={false}
              className={`${fieldClass} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="publish-label" className={labelClass}>
              Internal label (optional)
            </label>
            <input
              id="publish-label"
              value={form.label}
              onChange={set('label')}
              placeholder="Custody wallet 2"
              autoComplete="off"
              className={fieldClass}
            />
          </div>
        </div>

        <Note tone="warning">
          Deposits are pooled: every trader pays into this one address, so the chain alone will not
          say who sent what. Each claim carries a transaction reference, and that reference is what
          you match before authorizing.
        </Note>

        <div className="flex gap-2 pt-0.5">
          <button type="submit" disabled={busy} className={buttonClass('primary', 'flex-1')}>
            {busy ? 'Publishing…' : 'Publish to all traders'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className={buttonClass('secondary')}>
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}

/**
 * Withdraw or rotate a published address.
 *
 * Rotation is a single request, not "withdraw then publish". Two calls leave a
 * window where no address exists for that asset, and a failure between them
 * leaves it that way permanently.
 */
export function AddressActions({
  addressId,
  coin,
  network,
}: {
  addressId: string;
  coin: string;
  network: string;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<null | 'deactivate' | 'rotate'>(null);
  const [address, setAddress] = React.useState('');
  const [memoTag, setMemoTag] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const body =
        mode === 'rotate'
          ? {
              action: 'rotate',
              address: address.trim(),
              memoTag: memoTag.trim() || undefined,
              reason: reason.trim(),
            }
          : { action: 'deactivate', reason: reason.trim() };

      const response = await fetch(`/api/admin/deposit-addresses/${addressId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The change was not applied.');
        if (response.status === 409) router.refresh();
        return;
      }
      toast.success(
        mode === 'rotate'
          ? 'Address rotated. Every trader has been told.'
          : 'Address withdrawn. Every trader has been told.'
      );
      setMode(null);
      setAddress('');
      setMemoTag('');
      setReason('');
      router.refresh();
    } catch {
      toast.error('Unable to reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (!mode) {
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setMode('rotate')}
          className={buttonClass('secondary')}
        >
          Rotate
        </button>
        <button
          type="button"
          onClick={() => setMode('deactivate')}
          className={buttonClass('danger')}
        >
          Withdraw
        </button>
      </div>
    );
  }

  return (
    <Panel className="w-72">
      <p className="text-ds-caption font-normal leading-relaxed tracking-normal text-ds-text-muted">
        {mode === 'rotate'
          ? `Replace the ${coin} address on ${network} for everyone. The old one stays on record as inactive, because funds can still arrive at it.`
          : `Withdraw the ${coin} address on ${network}. Every trader is told to stop using it, and ${coin} deposits close until you publish another.`}
      </p>

      <form onSubmit={submit} className="space-y-2.5">
        {mode === 'rotate' && (
          <>
            <div>
              <label htmlFor={`rotate-address-${addressId}`} className={labelClass}>
                New address
              </label>
              <input
                id={`rotate-address-${addressId}`}
                required
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label htmlFor={`rotate-memo-${addressId}`} className={labelClass}>
                Memo / tag (optional)
              </label>
              <input
                id={`rotate-memo-${addressId}`}
                value={memoTag}
                onChange={(event) => setMemoTag(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={`${fieldClass} font-mono`}
              />
            </div>
          </>
        )}

        <div>
          <label htmlFor={`reason-${addressId}`} className={labelClass}>
            Reason (required)
          </label>
          <input
            id={`reason-${addressId}`}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || reason.trim().length < 4}
            className={buttonClass(mode === 'rotate' ? 'primary' : 'danger', 'flex-1')}
          >
            {busy ? 'Working…' : 'Confirm'}
          </button>
          <button type="button" onClick={() => setMode(null)} className={buttonClass('ghost')}>
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}

export function DeleteAddress({
  addressId,
  coin,
  network,
}: {
  addressId: string;
  coin: string;
  network: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    if (!window.confirm(`Permanently delete the inactive ${coin} address on ${network}?`)) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/deposit-addresses/${addressId}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The address was not deleted.');
        return;
      }
      toast.success('Inactive address permanently deleted.');
      router.refresh();
    } catch {
      toast.error('Unable to reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className={buttonClass('danger')}
      title="Permanently delete inactive address"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
