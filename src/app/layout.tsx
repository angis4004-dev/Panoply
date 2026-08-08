import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../styles/tailwind.css';
import '@/lib/chartSetup';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { AppStoreProvider } from '@/store/app-store';
import { IBM_Plex_Sans, IBM_Plex_Mono, Instrument_Serif, Orbitron } from 'next/font/google';
import { cn } from '@/lib/utils';

/*
 * Three typefaces, three jobs.
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
 * `font-normal`, never `font-bold`.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
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
  variable: '--font-display',
});

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-wordmark',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Aegis — Quantitative Intelligence for Decentralized Finance',
  description:
    'Aegis is a quantitative DeFi automation platform combining signal generation, automated execution, and risk management across secure sign-in, portfolio insights, vault discovery, and yield analysis.',
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
        orbitron.variable
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
        <AuthProvider>
          <AppStoreProvider>{children}</AppStoreProvider>
        </AuthProvider>
        <Toaster position="bottom-right" theme="dark" richColors />
      </body>
    </html>
  );
}
