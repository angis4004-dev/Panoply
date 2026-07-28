'use client';

import { PageHeader } from '@/components/dashboard/page-header';
import { useAppStore } from '@/store/app-store';

export default function SettingsPage() {
  const { user } = useAppStore();

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Settings"
        description="Manage your account and notification preferences."
      />

      <div className="mx-auto max-w-xl space-y-6">
        <section className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#8B95A5]">
            Account
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#8B95A5]">Name</label>
              <p className="mt-1 text-white">{user?.name || '—'}</p>
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
          </div>
        </section>

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
