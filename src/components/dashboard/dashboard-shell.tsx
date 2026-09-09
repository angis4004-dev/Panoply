'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import DashboardSidebar from '@/components/dashboard/sidebar';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { CopilotLauncher } from '@/components/copilot/copilot-launcher';
import { useAuth } from '@/hooks/use-auth';
import { useAppStore } from '@/store/app-store';
import { ACHIEVEMENT_CATALOG, type AchievementKey } from '@/lib/achievements/catalog';

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
    if (!loading && !user) {
      router.replace('/sign-up-login-screen');
    }
  }, [loading, user, router]);

  /*
   * Unverified users are no longer bounced to /dashboard/kyc from every route.
   *
   * The redirect was silent and fired on arrival, so signing in looked broken:
   * you entered your PIN, the dashboard painted for a frame, and you were
   * teleported to a form you had not asked for. Clicking Portfolio Builder did
   * the same thing. Two people read that as "the PIN does not work" - the last
   * thing they did was type a PIN, so the PIN got the blame.
   *
   * Nothing is lost by removing it. KYC is enforced where it actually matters,
   * on the server: POST /api/wallet refuses a deposit unless kycStatus is
   * 'verified', POST /api/bots gives an unverified tier a slot limit of 0, and
   * a vault position cannot be opened without a wallet balance that only a
   * KYC-gated deposit can create. The dashboard and the vaults page each carry
   * an inline prompt linking here, which asks rather than compels.
   */

  useEffect(() => {
    if (loading || !user) return;

    /*
     * The toast stays. It is the immediate acknowledgement, and it is now
     * backed by a durable notification written server-side in
     * grantAchievement - so an unlock that lands while the user is on another
     * tab is still there when they come back, instead of having been
     * announced to nobody.
     *
     * The event tells the bell to re-read rather than waiting for its poll,
     * so the badge and the toast appear together.
     */
    const announceUnlocks = (keys: string[]) => {
      for (const key of keys) {
        const def = ACHIEVEMENT_CATALOG.find((a) => a.key === (key as AchievementKey));
        addToast(`Achievement unlocked: ${def?.name || key} (+${def?.xp || 0} XP)`, 'success');
      }
      window.dispatchEvent(new Event('aegis:notifications-changed'));
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
          window.dispatchEvent(new Event('aegis:notifications-changed'));
        }
      })
      .catch(() => {});
    // Runs once per shell mount (i.e. roughly once per session), not on
    // every navigation — a heartbeat only needs to land once a day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.email]);

  return (
    <div className="flex min-h-screen bg-ds-surface text-ds-text">
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

      {/* Outside the main column so the sheet is positioned against the
          viewport rather than a scrolling container, and rendered here rather
          than in the layout so it sits inside the same auth and store
          providers the rest of the dashboard does. */}
      <CopilotLauncher />
    </div>
  );
}
