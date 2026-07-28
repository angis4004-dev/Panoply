'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/dashboard/page-header';
import { IdentityScore } from '@/components/dashboard/identity-score';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const { addToast } = useAppStore();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [confirmingWallet, setConfirmingWallet] = useState(false);

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
        <section className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#8B95A5]">
            Identity Score
          </h2>
          <IdentityScore score={0} size="sm" />
          <p className="mt-2 text-xs text-[#8B95A5]">
            Refreshes on the{' '}
            <a href="/dashboard/achievements" className="text-primary hover:underline">
              Achievements page
            </a>
            .
          </p>
        </section>

        <section className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#8B95A5]">
            Account
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#8B95A5]" htmlFor="settings-name">
                Name
              </label>
              <input
                id="settings-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#212A35] bg-[#0A0E13] px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#122131]"
              />
            </div>
            <div>
              <label className="text-xs text-[#8B95A5]">Email</label>
              <p className="mt-1 text-white">{user?.email || '—'}</p>
            </div>
            <div>
              <label className="text-xs text-[#8B95A5]">Role</label>
              <p className="mt-1">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {user?.role || 'Trader'}
                </span>
              </p>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-[#F2F5FA] hover:bg-[#3D77FF] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#122131]"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </section>

        {user?.walletAddress && !user?.walletOwnershipConfirmed && (
          <section className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#8B95A5]">
              Wallet
            </h2>
            <p className="mb-3 text-sm text-white">Assigned address: {user.walletAddress}</p>
            <button
              onClick={handleConfirmWallet}
              disabled={confirmingWallet}
              className="rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#122131]"
            >
              {confirmingWallet ? 'Confirming...' : 'Confirm this is your wallet'}
            </button>
          </section>
        )}

        <section className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#8B95A5]">
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
                <span className="text-sm text-[#E7ECF2]">{label}</span>
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-[#212A35] accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#122131]"
                />
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
