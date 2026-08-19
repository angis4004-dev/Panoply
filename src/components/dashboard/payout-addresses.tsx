'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { Loader } from '@/components/ui/loader';

/**
 * Where a trader's withdrawals are sent, one wallet per chain and coin.
 *
 * This form is what made withdrawal reachable. The API for saving a payout
 * address, the per-chain address validation and the withdrawal queue all
 * existed, but nothing in the interface ever called POST /api/payout-addresses
 * - so the withdraw page told the trader to "add one in Settings" and Settings
 * had no such control. Every trader hit the same dead end.
 *
 * The address rule for the chosen chain is shown before anything is typed.
 * Sending to a wrong-chain address is irreversible and the mistake is easy, so
 * the expected shape belongs on screen rather than in the error that follows.
 */

interface Network {
  key: string;
  name: string;
  description: string;
  addressPrefix: string;
  addressMinLength: number | null;
  addressMaxLength: number | null;
  memoSupported: boolean;
  memoRequired: boolean;
  coins: string[];
}

interface PayoutAddress {
  id: string;
  networkKey: string;
  coin: string;
  address: string;
  memoTag: string | null;
  label: string;
  confirmedAt: string | null;
}

/** Plain-language description of what a valid address looks like here. */
function addressHint(network: Network | undefined): string | null {
  if (!network) return null;
  const parts: string[] = [];
  if (network.addressPrefix) parts.push(`starts with ${network.addressPrefix}`);
  if (network.addressMinLength && network.addressMaxLength) {
    parts.push(
      network.addressMinLength === network.addressMaxLength
        ? `${network.addressMinLength} characters`
        : `${network.addressMinLength}–${network.addressMaxLength} characters`
    );
  }
  return parts.length > 0 ? `A ${network.name} address ${parts.join(', ')}.` : null;
}

export function PayoutAddresses() {
  const { addToast } = useAppStore();

  const [networks, setNetworks] = useState<Network[]>([]);
  const [addresses, setAddresses] = useState<PayoutAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [networkKey, setNetworkKey] = useState('');
  const [coin, setCoin] = useState('');
  const [address, setAddress] = useState('');
  const [memoTag, setMemoTag] = useState('');
  const [label, setLabel] = useState('');
  const [confirmOwnership, setConfirmOwnership] = useState(false);

  const selected = useMemo(
    () => networks.find((entry) => entry.key === networkKey),
    [networks, networkKey]
  );

  const load = useCallback(async () => {
    try {
      const [netRes, addrRes] = await Promise.all([
        fetch('/api/networks?for=withdrawal'),
        fetch('/api/payout-addresses'),
      ]);
      if (netRes.ok) {
        const body: { networks: Network[] } = await netRes.json();
        setNetworks(body.networks ?? []);
      }
      if (addrRes.ok) {
        const body: { addresses: PayoutAddress[] } = await addrRes.json();
        setAddresses(body.addresses ?? []);
      }
    } catch {
      // Left to the empty state. A failed load here must not take the rest of
      // the settings page down with it.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Coin follows the chain. A coin left over from a previous selection is how
  // someone ends up saving a USDT address on a chain that does not carry it.
  useEffect(() => {
    if (selected && !selected.coins.includes(coin)) {
      setCoin(selected.coins[0] ?? '');
    }
  }, [selected, coin]);

  const resetForm = () => {
    setNetworkKey('');
    setCoin('');
    setAddress('');
    setMemoTag('');
    setLabel('');
    setConfirmOwnership(false);
    setAdding(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/payout-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          networkKey,
          coin,
          address: address.trim(),
          memoTag: memoTag.trim() || undefined,
          label: label.trim() || undefined,
          confirmOwnership,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        addToast(body.error || 'Could not save that wallet.', 'error');
        return;
      }
      setAddresses((prev) => [...prev, body.address]);
      resetForm();
      addToast('Payout wallet saved. You can now request a withdrawal.', 'success');
    } catch {
      addToast('Could not save that wallet.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: PayoutAddress) => {
    setRemovingId(entry.id);
    try {
      const res = await fetch(`/api/payout-addresses/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate' }),
      });
      const body = await res.json();
      if (!res.ok) {
        addToast(body.error || 'Could not remove that wallet.', 'error');
        return;
      }
      setAddresses((prev) => prev.filter((row) => row.id !== entry.id));
      addToast('Payout wallet removed.', 'success');
    } catch {
      addToast('Could not remove that wallet.', 'error');
    } finally {
      setRemovingId(null);
    }
  };

  const canSubmit =
    networkKey !== '' &&
    coin !== '' &&
    address.trim().length >= 8 &&
    confirmOwnership &&
    (!selected?.memoRequired || memoTag.trim().length > 0);

  return (
    <section className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-ds-text-muted">
        Payout wallets
      </h2>
      <p className="mb-4 text-ds-caption text-ds-text-muted">
        Withdrawals are sent to a wallet you have saved and confirmed. Each one is tied to a single
        chain, so a payout can never be sent on a network the address does not exist on.
      </p>

      {loading ? (
        <span className="flex items-center gap-2 text-sm text-ds-text-muted">
          <Loader size={20} />
          Loading wallets…
        </span>
      ) : (
        <>
          {addresses.length === 0 ? (
            <p className="mb-4 rounded-lg border border-dashed border-ds-border px-3 py-4 text-center text-sm text-ds-text-muted">
              No payout wallet saved yet. Add one to enable withdrawals.
            </p>
          ) : (
            <ul className="mb-4 space-y-2">
              {addresses.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start gap-3 rounded-lg border border-ds-border bg-ds-surface-inset px-3 py-2.5"
                >
                  <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ds-text">
                      {entry.coin} on {entry.networkKey}
                      {entry.label && (
                        <span className="ml-2 text-ds-caption text-ds-text-muted">
                          {entry.label}
                        </span>
                      )}
                    </p>
                    {/* The address never translates - see the note on the
                        deposit address in components/dashboard/deposit-modal.tsx. */}
                    <p translate="no" className="break-all font-mono text-xs text-ds-text-muted">
                      {entry.address}
                    </p>
                    {entry.memoTag && (
                      <p translate="no" className="font-mono text-xs text-ds-text-muted">
                        Memo: {entry.memoTag}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(entry)}
                    disabled={removingId === entry.id}
                    aria-label={`Remove ${entry.coin} wallet on ${entry.networkKey}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-ds-text-muted transition-colors hover:text-ds-value-negative disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    {removingId === entry.id ? (
                      <Loader size={16} />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {networks.length === 0 ? (
            <p className="text-sm text-ds-text-muted">
              No withdrawal networks are available right now.
            </p>
          ) : !adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Plus className="h-4 w-4" />
              Add a payout wallet
            </button>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label
                  htmlFor="payout-network"
                  className="mb-1 block text-xs uppercase text-ds-text-muted"
                >
                  Network
                </label>
                <select
                  id="payout-network"
                  value={networkKey}
                  onChange={(event) => setNetworkKey(event.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-ds-border bg-ds-surface-inset px-3 text-sm text-ds-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Choose a chain…</option>
                  {networks.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.name}
                    </option>
                  ))}
                </select>
                {selected && (
                  <p className="mt-1 text-ds-caption text-ds-text-muted">{selected.description}</p>
                )}
              </div>

              {selected && selected.coins.length > 0 && (
                <div>
                  <label
                    htmlFor="payout-coin"
                    className="mb-1 block text-xs uppercase text-ds-text-muted"
                  >
                    Coin
                  </label>
                  <select
                    id="payout-coin"
                    value={coin}
                    onChange={(event) => setCoin(event.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-ds-border bg-ds-surface-inset px-3 text-sm text-ds-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {selected.coins.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="payout-address"
                  className="mb-1 block text-xs uppercase text-ds-text-muted"
                >
                  Wallet address
                </label>
                <input
                  id="payout-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  translate="no"
                  placeholder={selected?.addressPrefix ? `${selected.addressPrefix}…` : 'Paste it'}
                  className="min-h-[44px] w-full rounded-lg border border-ds-border bg-ds-surface-inset px-3 font-mono text-sm text-ds-text placeholder-ds-text-muted focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {addressHint(selected) && (
                  <p className="mt-1 text-ds-caption text-ds-text-muted">{addressHint(selected)}</p>
                )}
              </div>

              {selected?.memoSupported && (
                <div>
                  <label
                    htmlFor="payout-memo"
                    className="mb-1 block text-xs uppercase text-ds-text-muted"
                  >
                    Memo / tag {selected.memoRequired ? '(required)' : '(optional)'}
                  </label>
                  <input
                    id="payout-memo"
                    value={memoTag}
                    onChange={(event) => setMemoTag(event.target.value)}
                    autoComplete="off"
                    translate="no"
                    className="min-h-[44px] w-full rounded-lg border border-ds-border bg-ds-surface-inset px-3 font-mono text-sm text-ds-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="payout-label"
                  className="mb-1 block text-xs uppercase text-ds-text-muted"
                >
                  Label (optional)
                </label>
                <input
                  id="payout-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  maxLength={60}
                  placeholder="Ledger, Binance…"
                  className="min-h-[44px] w-full rounded-lg border border-ds-border bg-ds-surface-inset px-3 text-sm text-ds-text placeholder-ds-text-muted focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {/* The assertion the withdrawal gate reads. The platform cannot
                  verify key ownership without a signature challenge, so what is
                  recorded is that the trader was asked and said yes - which is
                  what an operator needs before sending somewhere irreversible. */}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-ds-border bg-ds-surface-inset px-3 py-3">
                <input
                  type="checkbox"
                  checked={confirmOwnership}
                  onChange={(event) => setConfirmOwnership(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ds-primary,#00D4AA)]"
                />
                <span className="text-sm text-ds-text">
                  I control this wallet and have checked the address. Transfers cannot be reversed.
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={!canSubmit || saving}
                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {saving && <Loader size={16} />}
                  <span>{saving ? 'Saving…' : 'Save wallet'}</span>
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="min-h-[44px] rounded-lg px-4 py-2 text-sm text-ds-text-muted transition-colors hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
