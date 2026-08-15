import { Archivo } from 'next/font/google';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { PinGate } from '@/components/dashboard/pin-gate';
import { AppStoreProvider } from '@/store/app-store';

/*
 * The application's own face, loaded in this segment rather than the root
 * layout so the marketing pages never download it.
 *
 * Archivo is a variable grotesque; the whole 400-700 range costs one file, and
 * the dashboard uses all of it - 400 body, 500 labels, 600 figures, 700 page
 * titles. That last one is why there is no second family here: a variable font
 * already spans quiet to loud, so headings can be set apart by weight and
 * tracking without introducing a typeface that competes for attention on a
 * screen people keep open all day.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo',
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    // type-dashboard repoints --font-sans and --font-display for this subtree,
    // so every font-sans / font-display utility below re-resolves through it
    // without any component changing. Definition in styles/tailwind.css.
    //
    // `font-sans` is repeated here on purpose. <html> already carries it, but
    // font-family inherits as a resolved value, not as the var() that produced
    // it - so text with no font class of its own would keep the family <html>
    // computed (Tahoma) and only explicitly-classed elements would pick up
    // Archivo. Re-declaring it inside the scope re-resolves the variable at
    // this level, and everything below inherits from here instead.
    <div className={`${archivo.variable} type-dashboard font-sans`}>
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
