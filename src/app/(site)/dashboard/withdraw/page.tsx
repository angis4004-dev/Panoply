'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpFromLine, Clock, Lock, ShieldCheck, Wallet } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';
import { Skeleton } from '@/components/ui/Skeleton';
import { WITHDRAWAL_LOCK_DAYS } from '@/lib/withdrawal-rules';

/**
 * Taking capital off the platform.
 *
 * The page leads with why a withdrawal is or is not possible rather than with
 * the form. Capital here is committed for a term, and someone who cannot
 * withdraw needs the date and the reason, not a disabled button with no
 * explanation.
 *
 * Every figure shown is read from /api/withdrawals, which computes them with
 * the same functions the POST enforces. The form disables what it can, but the
 * server refuses independently - none of the checks here are the real ones.
 */

interface PayoutAddress {
  id: string;
  networkKey: string;
  coin: string;
  address: string;
  memoTag: string | null;
  label: string;
}

interface WithdrawalRow {
  id: string;
  amountMinor: number;
  networkKey: string;
  coin: string;
  destinationAddress: string;
  status: string;
  rejectionReason: string | null;
  txReference: string | null;
  createdAt: string;
}

interface Standing {
  demo: boolean;
  demoNotice: string | null;
  horizonLabel: string;
  horizonAssumed: boolean;
  lock: {
    reason: 'not_started' | 'locked' | 'unlocked';
    awaiting: 'deposit' | 'trading' | 'both' | null;
    clockStartsAt: string | null;
    unlocksAt: string | null;
    withdrawable: boolean;
  };
  balanceMinor: number;
  pendingMinor: number;
  withdrawableMinor: number;
  kycStatus: string;
  walletOwnershipConfirmed: boolean;
  blockedReason: string | null;
  payoutAddresses: PayoutAddress[];
  withdrawals: WithdrawalRow[];
}

function money(minor: number): string {
  return `$${(minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function shortAddress(value: string): string {
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-ds-value-warning/10 text-ds-value-warning',
  approved: 'bg-primary/10 text-primary',
  paid: 'bg-ds-value-positive/10 text-ds-value-positive',
  rejected: 'bg-ds-value-negative/10 text-ds-value-negative',
};

export default function WithdrawPage() {
  const [data, setData] = useState<Standing | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [addressId, setAddressId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/withdrawals');
      if (!response.ok) throw new Error(String(response.status));
      const body: Standing = await response.json();
      setData(body);
      setAddressId((current) => current || (body.payoutAddresses[0]?.id ?? ''));
    } catch {
      setFormError('Could not load your withdrawal details. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, payoutAddressId: addressId }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(body.error ?? 'Your request could not be submitted.');
        return;
      }

      setSuccess('Request submitted. It now sits with our team for review.');
      setAmount('');
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Withdraw" description="Take capital off the platform." />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader title="Withdraw" description="Take capital off the platform." />
        <p className="rounded-xl border border-ds-value-negative/30 bg-ds-value-negative/10 p-4 text-sm text-ds-value-negative">
          {formError ?? 'Something went wrong.'}
        </p>
      </div>
    );
  }

  const canRequest =
    data.blockedReason === null && data.withdrawableMinor > 0 && data.payoutAddresses.length > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Withdraw"
        description="Take capital off the platform. Requests are reviewed by our team before any transfer is sent."
      />

      {data.demoNotice && (
        <div className="mb-6 rounded-xl border border-ds-value-warning/30 bg-ds-value-warning/[0.07] p-4 text-xs leading-relaxed text-ds-value-warning">
          <span className="font-bold uppercase tracking-widest">Demo</span> — {data.demoNotice}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
          <div className="flex items-center gap-2 text-ds-text-muted">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Wallet balance</span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-ds-text">
            {money(data.balanceMinor)}
          </p>
        </div>

        <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
          <div className="flex items-center gap-2 text-ds-text-muted">
            <ArrowUpFromLine className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">Available now</span>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-ds-text">
            {money(data.withdrawableMinor)}
          </p>
          {data.pendingMinor > 0 && (
            <p className="mt-1 text-xs text-ds-text-muted">
              {money(data.pendingMinor)} already requested
            </p>
          )}
        </div>

        <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
          <div className="flex items-center gap-2 text-ds-text-muted">
            {data.lock.withdrawable ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            <span className="text-xs font-bold uppercase tracking-widest">Term</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-ds-text">{WITHDRAWAL_LOCK_DAYS} days</p>
          <p className="mt-1 text-xs text-ds-text-muted">
            {data.lock.reason === 'unlocked'
              ? 'Unlocked'
              : data.lock.unlocksAt
                ? `Unlocks ${formatDate(data.lock.unlocksAt)}`
                : 'Not started'}
          </p>
        </div>
      </div>

      {/* The reason, stated before the form. A disabled button with no
          explanation is the thing that generates support tickets. */}
      {data.blockedReason && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-ds-value-warning/30 bg-ds-value-warning/[0.07] p-4 text-sm text-ds-value-warning">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{data.blockedReason}</p>
            {data.lock.reason === 'locked' && data.lock.unlocksAt && (
              <p className="mt-1 text-ds-text-muted">
                Your capital unlocks on {formatDate(data.lock.unlocksAt)}. The term started{' '}
                {formatDate(data.lock.clockStartsAt)}.
              </p>
            )}
            {data.lock.reason === 'not_started' && (
              <p className="mt-1 text-ds-text-muted">
                The term runs from the later of your first approved deposit and your first running
                signal flow — both are needed before the clock starts.
              </p>
            )}
            {data.kycStatus !== 'verified' && (
              <Link href="/dashboard/kyc" className="mt-1 inline-block underline">
                Verify your identity
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
          <h2 className="mb-4 font-semibold text-ds-text">Request a withdrawal</h2>

          {data.payoutAddresses.length === 0 ? (
            <p className="text-sm text-ds-text-muted">
              Save a payout wallet before withdrawing. Your funds are sent to an address you have
              confirmed you control —{' '}
              <Link href="/dashboard/settings" className="text-primary underline">
                add one in Settings
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="amount" className="mb-1 block text-xs uppercase text-ds-text-muted">
                  Amount (USD)
                </label>
                <input
                  id="amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={!canRequest || submitting}
                  placeholder="0.00"
                  className="min-h-[44px] w-full rounded-lg border border-ds-border bg-ds-surface-inset px-3 font-mono tabular-nums text-ds-text placeholder-ds-text-muted focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setAmount((data.withdrawableMinor / 100).toFixed(2))}
                  disabled={!canRequest}
                  className="mt-1.5 text-xs text-primary underline disabled:opacity-50"
                >
                  Withdraw all {money(data.withdrawableMinor)}
                </button>
              </div>

              <div>
                <label
                  htmlFor="destination"
                  className="mb-1 block text-xs uppercase text-ds-text-muted"
                >
                  Destination
                </label>
                <select
                  id="destination"
                  value={addressId}
                  onChange={(event) => setAddressId(event.target.value)}
                  disabled={!canRequest || submitting}
                  className="min-h-[44px] w-full rounded-lg border border-ds-border bg-ds-surface-inset px-3 text-sm text-ds-text focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                >
                  {data.payoutAddresses.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.coin} on {entry.networkKey} — {shortAddress(entry.address)}
                      {entry.label ? ` (${entry.label})` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-ds-text-muted">
                  Crypto transfers cannot be reversed. Check the network matches the wallet you are
                  sending to.
                </p>
              </div>

              {formError && (
                <p className="rounded-lg border border-ds-value-negative/30 bg-ds-value-negative/10 p-3 text-sm text-ds-value-negative">
                  {formError}
                </p>
              )}
              {success && (
                <p className="rounded-lg border border-ds-value-positive/30 bg-ds-value-positive/10 p-3 text-sm text-ds-value-positive">
                  {success}
                </p>
              )}

              <button
                type="submit"
                disabled={!canRequest || submitting || amount.trim() === ''}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowUpFromLine className="h-4 w-4" />
                {submitting ? 'Submitting…' : 'Request withdrawal'}
              </button>
            </form>
          )}
        </div>

        <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
          <h2 className="mb-4 font-semibold text-ds-text">Your requests</h2>
          {data.withdrawals.length === 0 ? (
            <p className="text-sm text-ds-text-muted">No withdrawals yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.withdrawals.map((row) => (
                <li key={row.id} className="border-b border-ds-border pb-3 last:border-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono font-semibold tabular-nums text-ds-text">
                      {money(row.amountMinor)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        STATUS_STYLES[row.status] ?? STATUS_STYLES.pending
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ds-text-muted">
                    {row.coin} on {row.networkKey} · {formatDate(row.createdAt)}
                  </p>
                  {row.rejectionReason && (
                    <p className="mt-1 text-xs text-ds-value-negative">{row.rejectionReason}</p>
                  )}
                  {row.txReference && (
                    <p className="mt-1 break-all font-mono text-xs text-ds-text-muted">
                      {row.txReference}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
