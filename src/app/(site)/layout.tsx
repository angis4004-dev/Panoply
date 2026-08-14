import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../../styles/tailwind.css';
import '@/lib/chartSetup';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { AppStoreProvider } from '@/store/app-store';
import {
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Instrument_Serif,
  Schibsted_Grotesk,
} from 'next/font/google';
import { cn } from '@/lib/utils';

/*
 * Typefaces are loaded here but not assigned here.
 *
 * Each family owns a variable named after itself (--font-plex-sans,
 * --font-instrument, ...). Two role variables, --font-sans and --font-display,
 * point at whichever family fills that role, and Tailwind's `font-sans` and
 * `font-display` read only the roles. Custom properties cascade, so any
 * subtree can repoint a role and every utility inside it follows without a
 * single component changing - which is how the dashboard runs Archivo and
 * Abril Fatface while the marketing pages keep Tahoma and Instrument Serif.
 * See the role definitions in styles/tailwind.css.
 *
 * Previously `--font-sans` fed both `font-sans` and `font-display`, so every
 * heading on the site was the body font at a heavier weight. Weight was the
 * only thing separating an H1 from a paragraph, which is the main reason the
 * pages read as untyped rather than designed.
 *
 * Instrument Serif ships a single 400 weight on purpose. High-contrast
 * editorial serifs hold up at display size unbolded, and asking for `font-bold`
 * on a 400-only family makes the browser synthesise a fake bold that smears the
 * thin strokes. Display headings therefore pair `font-display` with
 * `font-normal`, never `font-bold`. Abril Fatface is 400-only for the same
 * reason, so the rule carries over to the dashboard unchanged.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
});

/*
 * `font-mono` was pointed at 'JetBrains Mono' by bare family name with nothing
 * ever loading it, so all 55 usages (every price, P&L figure and metric) fell
 * through to the system default monospace - Courier New on Windows. Loading a
 * real face fixes numeric type across the dashboard.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
});

/*
 * The wordmark face, and only the wordmark.
 *
 * Schibsted Grotesk is what the Panoply logo is drawn in, so the lockup in the
 * navbar, the footer and the console has to be set in it or the rendered
 * wordmark stops matching the brand sheet. It deliberately does not feed
 * --font-sans: body copy stays Tahoma/IBM Plex Sans out here and Archivo in
 * the dashboard, and the display serifs are untouched.
 *
 * Replaces Orbitron, which was a wide squared-off techno face carrying the old
 * all-caps AEGIS lockup. Panoply is set sentence-case at normal tracking, and
 * Orbitron has no weight below 400 or any of the humanist detail that makes
 * the new wordmark read the way the logo does.
 */
const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-wordmark',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Panoply | Quantitative Intelligence for Decentralized Finance',
  description:
    'Panoply is a quantitative DeFi automation platform combining signal generation, automated execution, and risk management across secure sign-in, portfolio insights, vault discovery, and yield analysis.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn(
        'font-sans',
        plexSans.variable,
        plexMono.variable,
        instrumentSerif.variable,
        schibsted.variable
      )}
    >
      <body className="bg-[#0A0E13] text-[#E7ECF2] antialiased">
        {/* WCAG 2.4.1 (Bypass Blocks). Every page mounts a fixed navbar plus
            several nav landmarks, so without this a keyboard or screen-reader
            user tabs through the entire header on every navigation before
            reaching content. Styles live in the .skip-link rule in
            styles/tailwind.css; it parks off-screen and slides in on focus,
            above the z-50 navbar. */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {/*
         * AppStoreProvider used to sit here, wrapping every page. It fetches
         * bots, reports, vault investments and the wallet balance as soon as a
         * user appears, which meant that on a locked dashboard those requests
         * fired anyway - refused by the server, but fired, logged and retried
         * behind the PIN overlay. It now lives inside the gate, in
         * app/(site)/dashboard/layout.tsx, so before the PIN is accepted there
         * is no store to do any of that.
         */}
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="bottom-right" theme="dark" richColors />
      </body>
    </html>
  );
}
