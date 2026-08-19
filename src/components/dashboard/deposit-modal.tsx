'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, X } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAppStore } from '@/store/app-store';
import ButtonShimmer from '@/components/ui/button-shimmer';
import { Loader } from '@/components/ui/loader';

/**
 * How a trader actually deposits.
 *
 * Two steps, in the order the money moves. First the platform's published
 * address for the asset they chose, which is the only thing they need before
 * leaving for their wallet. Then, when they come back, the transaction
 * reference - because deposits are pooled into one address per asset, and that
 * reference is the only thing tying their transfer to their account.
 *
 * Nothing here credits anything. Submitting produces a pending claim an
 * operator authorizes after matching it on-chain. The modal says so plainly:
 * a trader who expects an instant balance and does not get one files a support
 * ticket, and the fix for that is the sentence, not the spinner.
 */

interface PlatformAddress {
  id: string;
  coin: string;
  /** Catalog key, e.g. TRC20. The stable identifier, not the label. */
  network: string;
  /** What the network is called, e.g. "Tron (TRC-20)". Falls back to the key. */
  networkName: string;
  networkDescription: string;
  memoRequired: boolean;
  address: string;
  memoTag: string | null;
}

interface TraderDeposit {
  id: string;
  coin: string;
  network: string;
  assetAmount: string;
  txReference: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  createdAt: string;
}

const FIELD =
  'w-full min-h-[44px] rounded-lg border border-ds-border bg-ds-surface-raised px-3 py-2.5 text-sm text-ds-text placeholder-ds-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition duration-fast ease-ds-out';

const LABEL = 'block text-xs font-semibold uppercase tracking-wide text-ds-text-muted mb-1.5';

const STATUS_TONE: Record<TraderDeposit['status'], string> = {
  pending: 'border-ds-value-warning/30 bg-ds-value-warning/10 text-ds-value-warning',
  approved: 'border-ds-value-positive/30 bg-ds-value-positive/10 text-ds-value-positive',
  rejected: 'border-ds-value-negative/30 bg-ds-value-negative/10 text-ds-value-negative',
};

export function DepositModal({ onClose }: { onClose: () => void }) {
  const { addToast, fetchWalletBalance } = useAppStore();

  const [addresses, setAddresses] = useState<PlatformAddress[] | null>(null);
  const [deposits, setDeposits] = useState<TraderDeposit[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assetAmount, setAssetAmount] = useState('');
  const [txReference, setTxReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const selected = addresses?.find((entry) => entry.id === selectedId) ?? null;

  // Durations mirror the ds-dur-slow / ds-dur-exit-slow tokens
  // (src/styles/tailwind.css) - GSAP tweens can't reference CSS custom
  // properties directly, so the values are duplicated here.
  useGSAP(
    () => {
      gsap.fromTo(backdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.38 });
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, scale: 0.95, y: 8 },
        { opacity: 1, scale: 1, y: 0, duration: 0.38, ease: 'power3.out' }
      );
    },
    { scope: containerRef }
  );

  // Plays the exit animation, then calls onClose via a plain timer rather than
  // the tween's onComplete callback - onComplete depends on GSAP's ticker
  // actually advancing, and decoupling the close signal from that means the
  // modal can never get stuck open if a frame never gets painted.
  const handleClose = useCallback(() => {
    gsap.to(backdropRef.current, { opacity: 0, duration: 0.23 });
    gsap.to(cardRef.current, { opacity: 0, scale: 0.95, y: 8, duration: 0.23, ease: 'power2.in' });
    setTimeout(onClose, 230);
  }, [onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [addressRes, depositRes] = await Promise.allSettled([
        fetch('/api/deposit-addresses'),
        fetch('/api/deposits'),
      ]);
      if (cancelled) return;

      if (addressRes.status === 'fulfilled' && addressRes.value.ok) {
        const list: PlatformAddress[] = await addressRes.value.json();
        setAddresses(list);
        // Preselect when there is nothing to choose between. Making someone
        // click the only option is a step that exists to be skipped.
        if (list.length === 1) setSelectedId(list[0].id);
      } else {
        setAddresses([]);
        setError('Could not load deposit addresses. Try again in a moment.');
      }

      if (depositRes.status === 'fulfilled' && depositRes.value.ok) {
        setDeposits(await depositRes.value.json());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      addToast('Could not copy. Select the text and copy manually.', 'info');
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depositAddressId: selected.id,
          assetAmount: assetAmount.trim(),
          txReference: txReference.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? 'The deposit was not recorded.');
        return;
      }

      addToast('Deposit submitted. It will be credited once confirmed.', 'success');
      setAssetAmount('');
      setTxReference('');
      setDeposits((prev) => [payload as TraderDeposit, ...prev]);
      // The balance has not moved yet, but the ledger is the only thing that
      // decides that - refetch rather than assume either way.
      void fetchWalletBalance();
    } catch {
      setError('Unable to reach the server.');
    } finally {
      setSubmitting(false);
    }
  }

  const ready = Boolean(selected) && assetAmount.trim() !== '' && txReference.trim().length >= 6;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-modal-title"
    >
      <div
        ref={backdropRef}
        onClick={handleClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={cardRef}
        className="relative z-10 my-auto w-full max-w-lg overflow-hidden rounded-xl border border-ds-border bg-ds-surface-overlay p-6"
      >
        <div className="pointer-events-none absolute -top-16 left-1/2 h-32 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="deposit-modal-title" className="text-lg font-bold text-ds-text">
              Deposit funds
            </h2>
            <p className="mt-0.5 text-sm text-ds-text-muted">
              Send to the address below, then tell us the transaction reference.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-ds-text-muted transition-colors duration-fast ease-ds-out hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-overlay"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative space-y-5">
          {addresses === null ? (
            <p className="flex items-center gap-2 py-6 text-sm text-ds-text-muted">
              <Loader size={18} />
              Loading deposit addresses…
            </p>
          ) : addresses.length === 0 ? (
            <p className="rounded-lg border border-ds-border bg-ds-surface-raised px-3 py-4 text-sm text-ds-text-muted">
              Deposits are not open yet. No address has been published for any asset. Check back
              shortly.
            </p>
          ) : (
            <>
              <div>
                <span className={LABEL}>1 · Choose an asset</span>
                <div className="flex flex-wrap gap-2">
                  {addresses.map((entry) => {
                    const active = entry.id === selectedId;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedId(entry.id)}
                        aria-pressed={active}
                        className={`inline-flex min-h-[44px] flex-col items-start justify-center rounded-lg border px-3 py-1.5 text-left transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                          active
                            ? 'border-primary/50 bg-primary/10 text-primary'
                            : 'border-ds-border text-ds-text hover:border-primary/30 hover:bg-ds-surface-inset'
                        }`}
                      >
                        {/* Ticker and chain are identifiers, not words. A
                            translator that helpfully renders BTC or TRC20 into
                            another language leaves the trader picking an asset
                            they cannot match against their own wallet. */}
                        <span translate="no" className="text-sm font-semibold">
                          {entry.coin}
                        </span>
                        <span translate="no" className="text-xs text-ds-text-muted">
                          {entry.networkName || entry.network}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selected && (
                <div>
                  <span className={LABEL}>2 · Send to this address</span>
                  <div className="rounded-lg border border-ds-border bg-ds-surface-raised p-3">
                    <div className="flex items-start gap-2">
                      {/*
                       * translate="no" is not cosmetic here.
                       *
                       * Chrome and Safari offer to machine-translate this page
                       * for any language we do not ship (see the locale list in
                       * i18n/routing.ts). A translator walks text nodes and
                       * rewrites them, and it has no concept of "this run of
                       * base58 is an address, not a word". Regrouped characters,
                       * a stripped leading zero or a case change all produce a
                       * string that still looks like an address and sends the
                       * money nowhere recoverable.
                       *
                       * The attribute is the standard opt-out and every engine
                       * that offers in-page translation honours it.
                       *
                       * The Copy button is already safe by construction - it
                       * reads selected.address out of React state, never off the
                       * DOM - so this protects the trader who reads the address
                       * on screen and types or compares it by eye.
                       */}
                      <code
                        translate="no"
                        className="min-w-0 flex-1 break-all font-mono text-xs text-ds-text"
                      >
                        {selected.address}
                      </code>
                      <button
                        type="button"
                        onClick={() => copy(selected.address, 'address')}
                        className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded border border-ds-border px-2 text-xs font-medium text-ds-text transition-colors duration-fast ease-ds-out hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        {copied === 'address' ? (
                          <Check className="h-3 w-3 text-ds-value-positive" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3 w-3" aria-hidden="true" />
                        )}
                        {/*
                         * Wrapped rather than bare.
                         *
                         * A translator replaces this text node with its own
                         * <font> element. React kept a reference to the original
                         * node, so the next flip of `copied` calls removeChild
                         * on a node that is no longer a child - NotFoundError,
                         * and the modal unmounts to a blank screen mid-deposit.
                         * Giving React an element it still owns means it swaps
                         * textContent inside the span and the translated node
                         * is never the thing being removed.
                         */}
                        <span>{copied === 'address' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    {selected.memoTag && (
                      <div className="mt-2 flex items-start gap-2 border-t border-ds-border pt-2">
                        <span className="text-xs text-ds-text-muted">Memo / tag</span>
                        {/* Same reasoning as the address above: on the chains
                            that use one, a wrong memo loses the deposit just as
                            completely as a wrong address. */}
                        <code
                          translate="no"
                          className="min-w-0 flex-1 break-all font-mono text-xs text-ds-text"
                        >
                          {selected.memoTag}
                        </code>
                        <button
                          type="button"
                          onClick={() => copy(selected.memoTag as string, 'memo')}
                          className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded border border-ds-border px-2 text-xs font-medium text-ds-text transition-colors duration-fast ease-ds-out hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        >
                          {copied === 'memo' ? (
                            <Check className="h-3 w-3 text-ds-value-positive" aria-hidden="true" />
                          ) : (
                            <Copy className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span>{copied === 'memo' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* The two ways to lose the money outright, stated before the
                      form rather than after it. */}
                  <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-ds-value-warning">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    {/* The sentence around them should translate - this is the
                        warning that stops someone sending USDT to a BTC address,
                        so it has to be readable. Only the two identifiers inside
                        it are held back. */}
                    <span>
                      Send only <strong translate="no">{selected.coin}</strong> on the{' '}
                      <strong translate="no">{selected.network}</strong> network
                      <span>{selected.memoTag ? ', and include the memo above' : ''}</span>.
                      Anything else is unrecoverable.
                    </span>
                  </p>

                  {/* Written by the operator against the network in the console.
                      Chain-specific guidance - fees, confirmation times - that
                      the generic warning above cannot carry. */}
                  {selected.networkDescription ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-ds-text-muted">
                      {selected.networkDescription}
                    </p>
                  ) : null}
                </div>
              )}

              {selected && (
                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <span className={LABEL}>3 · Confirm what you sent</span>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="deposit-amount" className="sr-only">
                          Amount sent in {selected.coin}
                        </label>
                        <input
                          id="deposit-amount"
                          inputMode="decimal"
                          value={assetAmount}
                          onChange={(event) => setAssetAmount(event.target.value)}
                          placeholder={`Amount in ${selected.coin}`}
                          autoComplete="off"
                          className={`${FIELD} font-mono`}
                        />
                      </div>
                      <div>
                        <label htmlFor="deposit-tx" className="sr-only">
                          Transaction hash
                        </label>
                        <input
                          id="deposit-tx"
                          value={txReference}
                          onChange={(event) => setTxReference(event.target.value)}
                          placeholder="Transaction hash"
                          autoComplete="off"
                          spellCheck={false}
                          className={`${FIELD} font-mono`}
                        />
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs text-ds-text-muted">
                      Everyone deposits to the same address, so the hash is how we find your
                      transfer. Copy it from your wallet or the block explorer.
                    </p>
                  </div>

                  {error && (
                    <p className="rounded-lg border border-ds-value-negative/30 bg-ds-value-negative/[0.07] px-3 py-2 text-xs text-ds-value-negative">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !ready}
                    className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors duration-fast ease-ds-out hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-overlay"
                  >
                    {!submitting && ready && <ButtonShimmer />}
                    {submitting && <Loader size={16} />}
                    {submitting ? 'Submitting…' : "I've sent it"}
                  </button>

                  <p className="text-center text-xs text-ds-text-muted">
                    Your balance changes once an operator confirms the transfer on-chain. Nothing is
                    credited on submission.
                  </p>
                </form>
              )}
            </>
          )}

          {deposits.length > 0 && (
            <div className="border-t border-ds-border pt-4">
              <span className={LABEL}>Your recent deposits</span>
              <ul className="space-y-1.5">
                {deposits.slice(0, 5).map((deposit) => (
                  <li
                    key={deposit.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ds-border bg-ds-surface-raised px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-ds-text">
                        {deposit.assetAmount} {deposit.coin}
                      </div>
                      <div className="truncate text-xs text-ds-text-muted">
                        {new Date(deposit.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {deposit.rejectionReason ? ` · ${deposit.rejectionReason}` : ''}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${STATUS_TONE[deposit.status]}`}
                    >
                      {deposit.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
