import { Abril_Fatface, Archivo } from 'next/font/google';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

/*
 * The application's own pairing, loaded in this segment rather than the root
 * layout so the marketing pages never download it.
 *
 * Archivo is a variable grotesque; the whole 400-700 range costs one file, and
 * the dashboard uses most of it (400 body, 500 labels, 600 figures, 700 the
 * occasional emphasis).
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo',
});

/*
 * Abril Fatface ships one weight, like Instrument Serif before it, so display
 * headings keep pairing `font-display` with `font-normal`. Asking a 400-only
 * family for bold makes the browser synthesise one, and on a didone this thick
 * that smears the hairlines badly.
 */
const abril = Abril_Fatface({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-abril',
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
    <div className={`${archivo.variable} ${abril.variable} type-dashboard font-sans`}>
      <DashboardShell>{children}</DashboardShell>
    </div>
  );
}
