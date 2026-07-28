'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { useAuth } from '@/hooks/use-auth';
import { useAppStore } from '@/store/app-store';
import { ACHIEVEMENT_CATALOG, type AchievementKey } from '@/lib/achievements/catalog';

const KYC_PATH = '/dashboard/kyc';

function sectionFromPathname(pathname: string): string | null {
  if (pathname === '/dashboard') return 'overview';
  const segment = pathname.split('/')[2];
  const known = ['ai', 'bots', 'vaults', 'yield', 'builder', 'history', 'kyc', 'settings'];
  return segment && known.includes(segment) ? segment : null;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user, loading } = useAuth();
  const { addToast } = useAppStore();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // First-time KYC submission is mandatory before the rest of the
    // dashboard is reachable; once submitted (pending/verified/rejected),
    // navigation is unrestricted regardless of review outcome.
    if (!loading && user?.kycStatus === 'unverified' && pathname !== KYC_PATH) {
      router.replace(KYC_PATH);
    }
  }, [loading, user, pathname, router]);

  useEffect(() => {
    if (loading || !user) return;

    const announceUnlocks = (keys: string[]) => {
      for (const key of keys) {
        const def = ACHIEVEMENT_CATALOG.find((a) => a.key === (key as AchievementKey));
        addToast(`Achievement unlocked: ${def?.name || key} (+${def?.xp || 0} XP)`, 'success');
      }
    };

    const section = sectionFromPathname(pathname);
    if (section) {
      fetch('/api/achievements/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then(
          (data) => data?.unlockedAchievements?.length && announceUnlocks(data.unlockedAchievements)
        )
        .catch(() => {});
    }
  }, [pathname, loading, user, addToast]);

  useEffect(() => {
    if (loading || !user) return;

    fetch('/api/achievements/heartbeat', { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.unlockedAchievements?.length) {
          for (const key of data.unlockedAchievements) {
            const def = ACHIEVEMENT_CATALOG.find((a) => a.key === (key as AchievementKey));
            addToast(`Achievement unlocked: ${def?.name || key} (+${def?.xp || 0} XP)`, 'success');
          }
        }
      })
      .catch(() => {});
    // Runs once per shell mount (i.e. roughly once per session), not on
    // every navigation — a heartbeat only needs to land once a day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.email]);

  return (
    <div className="flex min-h-screen bg-[#0A0E13] text-[#E7ECF2]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block shrink-0">
        <DashboardSidebar />
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
          <div className="relative h-full w-64 shadow-2xl">
            <DashboardSidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col min-w-0">
        <DashboardHeader onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
