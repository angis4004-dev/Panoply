import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { PinGate } from '@/components/dashboard/pin-gate';
import { AppStoreProvider } from '@/store/app-store';

/*
 * No font loading here any more. The dashboard shares Geist with the rest of
 * the site, and the root layout already loads it. Variable, so the 400 body,
 * 500 labels, 600 figures and 700 page titles the app uses are one file.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    // type-dashboard re-resolves --font-sans and --font-display for this
    // subtree; definition in styles/tailwind.css. `font-sans` is repeated
    // because font-family inherits as a resolved value, not as the var() that
    // produced it, so re-declaring it here is what lets a future repoint of the
    // roles reach unclassed text below.
    <div className="type-dashboard font-sans">
      {/*
       * Outside DashboardShell, not inside it. The shell renders the
       * navigation, the notification bell and the account menu, all of which
       * fetch on mount - putting the gate within it would leave those calls
       * firing behind the overlay and the nav visible around its edges.
       *
       * This layout wraps every route in the segment, so /dashboard/bots,
       * /dashboard/vaults, /dashboard/settings and anything added later are
       * gated by construction rather than by remembering to gate them. Nothing
       * outside this segment is affected: the marketing pages, the auth pages
       * and the admin application each have their own layout.
       */}
      <PinGate>
        {/* Inside the gate on purpose - see the note in (site)/layout.tsx. */}
        <AppStoreProvider>
          <DashboardShell>{children}</DashboardShell>
        </AppStoreProvider>
      </PinGate>
    </div>
  );
}
