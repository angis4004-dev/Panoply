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
import { ADDRESS_FAMILY_LABELS, type AddressFamily } from '@/lib/crypto-address';

/**
 * Adding and editing chains.
 *
 * The address format is the field that matters here. Everything else on this
 * form is presentation; that one decides whether a wrong-chain address is
 * caught or paid out, so it is a required choice with no default that silently
 * disables checking.
 */

const FAMILIES: AddressFamily[] = ['evm', 'tron', 'solana', 'custom', 'none'];
const CHARSETS = ['hex', 'base58', 'base32', 'alphanumeric'] as const;

interface NetworkFormState {
  key: string;
  name: string;
  description: string;
  addressFamily: AddressFamily;
  addressPrefix: string;
  addressCharset: string;
  addressMinLength: string;
  addressMaxLength: string;
  memoSupported: boolean;
  memoRequired: boolean;
  coins: string;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  minWithdrawal: string;
  sortOrder: string;
}

const EMPTY: NetworkFormState = {
  key: '',
  name: '',
  description: '',
  addressFamily: 'evm',
  addressPrefix: '',
  addressCharset: 'alphanumeric',
  addressMinLength: '',
  addressMaxLength: '',
  memoSupported: false,
  memoRequired: false,
  coins: '',
  depositEnabled: true,
  withdrawalEnabled: true,
  minWithdrawal: '',
  sortOrder: '100',
};

/** Comma or space separated, uppercased, de-duplicated. */
function parseCoins(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[,\s]+/)) {
    const value = part.trim().toUpperCase();
    if (value) seen.add(value);
  }
  return [...seen];
}

/**
 * Dollars to minor units.
 *
 * Parsed from the string rather than a number input so "10.005" is rejected
 * rather than silently rounded - a half-cent floor is a rule nobody can act on.
 */
function parseMinorUnits(raw: string): number | null | 'invalid' {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return 'invalid';
  return Math.round(Number(value) * 100);
}

function AddressFormatFields({
  form,
  update,
  idPrefix,
}: {
  form: NetworkFormState;
  update: <K extends keyof NetworkFormState>(key: K, value: NetworkFormState[K]) => void;
  idPrefix: string;
}) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-family`} className={labelClass}>
          Address format
        </label>
        <select
          id={`${idPrefix}-family`}
          value={form.addressFamily}
          onChange={(event) => update('addressFamily', event.target.value as AddressFamily)}
          className={fieldClass}
        >
          {FAMILIES.map((family) => (
            <option key={family} value={family}>
              {ADDRESS_FAMILY_LABELS[family]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-ds-caption font-normal tracking-normal text-ds-text-muted">
          Every address published on this network, and every payout address a trader saves for it,
          is checked against this. It is what stops an address for another chain being accepted.
        </p>
      </div>

      {form.addressFamily === 'custom' && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-prefix`} className={labelClass}>
              Prefix (optional)
            </label>
            <input
              id={`${idPrefix}-prefix`}
              value={form.addressPrefix}
              onChange={(event) => update('addressPrefix', event.target.value)}
              placeholder="bc1"
              autoComplete="off"
              spellCheck={false}
              className={`${fieldClass} font-mono`}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-charset`} className={labelClass}>
              Character set
            </label>
            <select
              id={`${idPrefix}-charset`}
              value={form.addressCharset}
              onChange={(event) => update('addressCharset', event.target.value)}
              className={fieldClass}
            >
              {CHARSETS.map((charset) => (
                <option key={charset} value={charset}>
                  {charset}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${idPrefix}-min`} className={labelClass}>
              Minimum length
            </label>
            <input
              id={`${idPrefix}-min`}
              inputMode="numeric"
              value={form.addressMinLength}
              onChange={(event) => update('addressMinLength', event.target.value)}
              placeholder="42"
              className={`${fieldClass} font-mono`}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-max`} className={labelClass}>
              Maximum length
            </label>
            <input
              id={`${idPrefix}-max`}
              inputMode="numeric"
              value={form.addressMaxLength}
              onChange={(event) => update('addressMaxLength', event.target.value)}
              placeholder="62"
              className={`${fieldClass} font-mono`}
            />
          </div>
        </div>
      )}

      {form.addressFamily === 'none' && (
        <Note tone="warning">
          Addresses on this network will only be length-checked. An address for a different chain
          will be accepted, and anything sent to it is unrecoverable.
        </Note>
      )}
    </>
  );
}

function Toggle({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 text-ds-label font-normal tracking-normal text-ds-text"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
      />
      <span>{children}</span>
    </label>
  );
}

/** Shared body of the create and edit forms. */
function NetworkFields({
  form,
  update,
  idPrefix,
  isNew,
}: {
  form: NetworkFormState;
  update: <K extends keyof NetworkFormState>(key: K, value: NetworkFormState[K]) => void;
  idPrefix: string;
  isNew: boolean;
}) {
  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-key`} className={labelClass}>
            Key
          </label>
          <input
            id={`${idPrefix}-key`}
            required
            disabled={!isNew}
            value={form.key}
            onChange={(event) => update('key', event.target.value)}
            placeholder="TRC20"
            autoComplete="off"
            spellCheck={false}
            className={`${fieldClass} font-mono uppercase disabled:cursor-not-allowed disabled:opacity-60`}
          />
          <p className="mt-1 text-ds-caption font-normal tracking-normal text-ds-text-muted">
            {isNew
              ? 'Letters and numbers only. Cannot be changed later.'
              : 'Fixed. Every deposit and withdrawal on this chain refers to it.'}
          </p>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-name`} className={labelClass}>
            Display name
          </label>
          <input
            id={`${idPrefix}-name`}
            required
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="Tron (TRC-20)"
            autoComplete="off"
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-description`} className={labelClass}>
          Description (optional)
        </label>
        <input
          id={`${idPrefix}-description`}
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
          placeholder="Low fees and fast confirmation."
          className={fieldClass}
        />
        <p className="mt-1 text-ds-caption font-normal tracking-normal text-ds-text-muted">
          Shown to traders under the network name when they pick it.
        </p>
      </div>

      <AddressFormatFields form={form} update={update} idPrefix={idPrefix} />

      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-coins`} className={labelClass}>
            Coins (optional)
          </label>
          <input
            id={`${idPrefix}-coins`}
            value={form.coins}
            onChange={(event) => update('coins', event.target.value)}
            placeholder="USDT, USDC"
            autoComplete="off"
            spellCheck={false}
            className={`${fieldClass} font-mono uppercase`}
          />
          <p className="mt-1 text-ds-caption font-normal tracking-normal text-ds-text-muted">
            Leave empty to allow any coin on this chain.
          </p>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-min-withdrawal`} className={labelClass}>
            Minimum withdrawal (optional)
          </label>
          <input
            id={`${idPrefix}-min-withdrawal`}
            inputMode="decimal"
            value={form.minWithdrawal}
            onChange={(event) => update('minWithdrawal', event.target.value)}
            placeholder="25.00"
            className={`${fieldClass} font-mono`}
          />
          <p className="mt-1 text-ds-caption font-normal tracking-normal text-ds-text-muted">
            In dollars. A payout smaller than the chain&rsquo;s own fee loses money for both sides.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle
          id={`${idPrefix}-deposit`}
          checked={form.depositEnabled}
          onChange={(next) => update('depositEnabled', next)}
        >
          Accept deposits
        </Toggle>
        <Toggle
          id={`${idPrefix}-withdrawal`}
          checked={form.withdrawalEnabled}
          onChange={(next) => update('withdrawalEnabled', next)}
        >
          Allow withdrawals
        </Toggle>
        <Toggle
          id={`${idPrefix}-memo-supported`}
          checked={form.memoSupported}
          onChange={(next) => {
            update('memoSupported', next);
            if (!next) update('memoRequired', false);
          }}
        >
          Transfers carry a memo or tag
        </Toggle>
        <Toggle
          id={`${idPrefix}-memo-required`}
          checked={form.memoRequired}
          onChange={(next) => {
            update('memoRequired', next);
            if (next) update('memoSupported', true);
          }}
        >
          A memo is required
        </Toggle>
      </div>
    </>
  );
}

/**
 * Turn the form's strings into the API's shape.
 *
 * Returns a complaint instead of a body when a number field cannot be parsed,
 * so the caller reports it rather than sending NaN.
 */
function buildPayload(
  form: NetworkFormState
): { body: Record<string, unknown> } | { error: string } {
  const minWithdrawal = parseMinorUnits(form.minWithdrawal);
  if (minWithdrawal === 'invalid') {
    return { error: 'The minimum withdrawal must be an amount like 25 or 25.00.' };
  }

  const body: Record<string, unknown> = {
    name: form.name.trim(),
    description: form.description.trim(),
    addressFamily: form.addressFamily,
    memoSupported: form.memoSupported,
    memoRequired: form.memoRequired,
    coins: parseCoins(form.coins),
    depositEnabled: form.depositEnabled,
    withdrawalEnabled: form.withdrawalEnabled,
    minWithdrawalMinor: minWithdrawal,
    sortOrder: Number(form.sortOrder) || 100,
  };

  if (form.addressFamily === 'custom') {
    const min = Number(form.addressMinLength);
    const max = Number(form.addressMaxLength);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < 1) {
      return { error: 'A custom format needs a whole-number minimum and maximum length.' };
    }
    body.addressPrefix = form.addressPrefix.trim();
    body.addressCharset = form.addressCharset;
    body.addressMinLength = min;
    body.addressMaxLength = max;
  }

  return { body };
}

export function AddNetwork() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<NetworkFormState>(EMPTY);
  const [busy, setBusy] = React.useState(false);

  const update = React.useCallback(
    <K extends keyof NetworkFormState>(key: K, value: NetworkFormState[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    []
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const built = buildPayload(form);
    if ('error' in built) {
      toast.error(built.error);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/admin/networks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...built.body, key: form.key.trim().toUpperCase() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The network was not added.');
        return;
      }
      toast.success(`${form.key.toUpperCase()} added.`);
      setForm(EMPTY);
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
        Add network
      </button>
    );
  }

  return (
    <Panel className="w-full max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-ds-label font-semibold text-ds-text">Add a network</h3>
          <p className="mt-0.5 text-ds-caption font-normal tracking-normal text-ds-text-muted">
            A chain the platform will move money on, and what a valid address looks like on it.
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
        <NetworkFields form={form} update={update} idPrefix="add-network" isNew />
        <div className="flex justify-end gap-2 pt-1">
          <button type="submit" disabled={busy} className={buttonClass('primary')}>
            {busy ? 'Adding…' : 'Add network'}
          </button>
        </div>
      </form>
    </Panel>
  );
}

export interface EditableNetwork {
  id: string;
  key: string;
  name: string;
  description: string;
  addressFamily: string;
  addressPrefix: string;
  addressCharset: string;
  addressMinLength: number | null;
  addressMaxLength: number | null;
  memoSupported: boolean;
  memoRequired: boolean;
  coins: string[];
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  minWithdrawalMinor: number | null;
  sortOrder: number;
  status: string;
}

export function NetworkActions({ network }: { network: EditableNetwork }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState<NetworkFormState>(() => ({
    key: network.key,
    name: network.name,
    description: network.description,
    addressFamily: network.addressFamily as AddressFamily,
    addressPrefix: network.addressPrefix,
    addressCharset: network.addressCharset,
    addressMinLength: network.addressMinLength?.toString() ?? '',
    addressMaxLength: network.addressMaxLength?.toString() ?? '',
    memoSupported: network.memoSupported,
    memoRequired: network.memoRequired,
    coins: network.coins.join(', '),
    depositEnabled: network.depositEnabled,
    withdrawalEnabled: network.withdrawalEnabled,
    minWithdrawal:
      network.minWithdrawalMinor === null ? '' : (network.minWithdrawalMinor / 100).toFixed(2),
    sortOrder: String(network.sortOrder),
  }));

  const update = React.useCallback(
    <K extends keyof NetworkFormState>(key: K, value: NetworkFormState[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    []
  );

  async function patch(body: Record<string, unknown>, successMessage: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/networks/${network.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The change was not saved.');
        return;
      }
      toast.success(successMessage);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error('Unable to reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const built = buildPayload(form);
    if ('error' in built) {
      toast.error(built.error);
      return;
    }
    await patch(built.body, `${network.key} updated.`);
  }

  if (!open) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg px-2 py-1 text-ds-caption font-medium text-ds-text-muted transition-colors duration-fast ease-ds-out hover:bg-ds-surface-inset hover:text-ds-text"
        >
          Edit
        </button>
        {network.status === 'active' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ status: 'inactive' }, `${network.key} deactivated.`)}
            className="rounded-lg px-2 py-1 text-ds-caption font-medium text-ds-text-muted transition-colors duration-fast ease-ds-out hover:bg-ds-surface-inset hover:text-ds-text disabled:opacity-50"
          >
            Deactivate
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => patch({ status: 'active' }, `${network.key} reactivated.`)}
              className="rounded-lg px-2 py-1 text-ds-caption font-medium text-ds-text-muted transition-colors duration-fast ease-ds-out hover:bg-ds-surface-inset hover:text-ds-text disabled:opacity-50"
            >
              Reactivate
            </button>
            <DeleteNetwork networkKey={network.key} networkId={network.id} />
          </>
        )}
      </div>
    );
  }

  return (
    <Panel className="w-full max-w-xl">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-ds-label font-semibold text-ds-text">Edit {network.key}</h3>
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
        <NetworkFields form={form} update={update} idPrefix={`edit-${network.id}`} isNew={false} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="submit" disabled={busy} className={buttonClass('primary')}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function DeleteNetwork({ networkId, networkKey }: { networkId: string; networkKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    if (!window.confirm(`Permanently delete the inactive ${networkKey} network?`)) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/networks/${networkId}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The network was not deleted.');
        return;
      }
      toast.success('Inactive network permanently deleted.');
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
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-ds-caption font-medium text-ds-value-negative transition-colors duration-fast ease-ds-out hover:bg-ds-value-negative/10 disabled:opacity-50"
      title="Permanently delete inactive network"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
