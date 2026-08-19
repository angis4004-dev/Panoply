'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard/page-header';
import { IdentityScore } from '@/components/dashboard/identity-score';
import { PinSection } from '@/components/dashboard/pin-section';
import { PayoutAddresses } from '@/components/dashboard/payout-addresses';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';
import { Loader } from '@/components/ui/loader';
import Link from 'next/link';

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const { addToast } = useAppStore();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [confirmingWallet, setConfirmingWallet] = useState(false);

  /*
   * The identity score was hardcoded to 0 here, under a note saying it
   * "refreshes on the Achievements page". It did not refresh anywhere - it
   * was the literal 0 - so an account showing 83 on the overview and 83 on
   * the achievements page showed 0 on this one. A number that disagrees with
   * itself across three screens is worse than no number, because the user
   * cannot tell which screen to believe.
   *
   * Same endpoint the overview already uses.
   */
  const [identityScore, setIdentityScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/achievements')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.identityScore === 'number') {
          setIdentityScore(data.identityScore);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveProfile = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Failed to save profile.', 'error');
        return;
      }
      if (user) setUser({ ...user, name: data.name });
      addToast('Profile saved.', 'success');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmWallet = async () => {
    setConfirmingWallet(true);
    try {
      const res = await fetch('/api/wallet/confirm-ownership', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Failed to confirm wallet.', 'error');
        return;
      }
      if (user) setUser({ ...user, walletOwnershipConfirmed: true });
      addToast('Wallet ownership confirmed.', 'success');
    } finally {
      setConfirmingWallet(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Settings"
        description="Manage your account and notification preferences."
      />

      <div className="mx-auto max-w-xl space-y-6">
        <section className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ds-text-muted">
            Identity Score
          </h2>
          {/* Nothing is drawn until the real score arrives. Rendering the
              ring at 0 first would animate up from a value that was never
              true, which is how it came to look like a working number. */}
          {identityScore === null ? (
            <span className="flex items-center gap-2 text-sm text-ds-text-muted">
              <Loader size={20} />
              Loading your score
            </span>
          ) : (
            <IdentityScore score={identityScore} size="sm" />
          )}
          <p className="mt-2 text-xs text-ds-text-muted">
            How it is calculated, and how to raise it, on the{' '}
            <Link href="/dashboard/achievements" className="text-primary hover:underline">
              Achievements page
            </Link>
            .
          </p>
        </section>

        <section className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ds-text-muted">
            Account
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-ds-text-muted" htmlFor="settings-name">
                Name
              </label>
              <input
                id="settings-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised"
              />
            </div>
            <div>
              <label className="text-xs text-ds-text-muted">Email</label>
              <p className="mt-1 text-ds-text">{user?.email || '—'}</p>
            </div>
            <div>
              <label className="text-xs text-ds-text-muted">Role</label>
              <p className="mt-1">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {user?.role || 'Trader'}
                </span>
              </p>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised"
            >
              {saving && <Loader size={16} />}
              <span>{saving ? 'Saving…' : 'Save Profile'}</span>
            </button>
          </div>
        </section>

        {/* The control the withdraw page sends people here to find. Until this
            existed the link led to a page with nothing on it to click. */}
        <PayoutAddresses />

        {/* The legacy single-wallet confirmation, kept because the achievements
            engine still scores it. It is no longer what withdrawal is gated on
            - that moved to the per-chain confirmation above, because this
            block only renders for an assigned walletAddress and essentially no
            account has one, which made withdrawal impossible to reach. */}
        {user?.walletAddress && !user?.walletOwnershipConfirmed && (
          <section className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ds-text-muted">
              Wallet
            </h2>
            {/* The label translates, the address does not - see the note on the
                deposit address in components/dashboard/deposit-modal.tsx. */}
            <p className="mb-3 text-sm text-ds-text">
              Assigned address:{' '}
              <span translate="no" className="font-mono break-all">
                {user.walletAddress}
              </span>
            </p>
            <button
              onClick={handleConfirmWallet}
              disabled={confirmingWallet}
              className="flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised"
            >
              {confirmingWallet && <Loader size={16} />}
              <span>{confirmingWallet ? 'Confirming…' : 'Confirm this is your wallet'}</span>
            </button>
          </section>
        )}

        <PinSection />

        <section className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ds-text-muted">
            Notifications
          </h2>
          <div className="space-y-3">
            {[
              'Signal flow alerts',
              'Yield opportunities',
              'Portfolio reports',
              'Security alerts',
            ].map((label) => (
              <label key={label} className="flex items-center justify-between">
                <span className="text-sm text-ds-text">{label}</span>
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-ds-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised"
                />
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
