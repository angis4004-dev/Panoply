import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../../styles/tailwind.css';
import { Toaster } from 'sonner';
import { Archivo, IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google';

/**
 * The admin console's own root layout.
 *
 * This is why the trader application lives under (site) and this under
 * (admin): two route groups, two root layouts, no shared tree above them. The
 * console therefore mounts none of the trader app's providers - no
 * AuthProvider polling /api/auth/session, no AppStoreProvider holding a
 * trader's bots and toasts. On the admin origin those endpoints do not even
 * exist, and a console that tried to call them would spend every page load
 * failing quietly.
 *
 * What it does share is the design system. The console runs the same ds-*
 * tokens and the same Archivo face as /dashboard, for the same reason the
 * dashboard does: both are dense screens full of figures that someone reads
 * for hours. Two products that clearly belong to one company, distinguished
 * by what they say rather than by an unrelated palette.
 */

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-archivo',
});

// Hashes, addresses, amounts and timestamps. Tabular figures stop columns
// jittering as values change, which on a queue that refreshes is the
// difference between scannable and seasick.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

// The wordmark face, matching the trader application. See the longer note in
// (site)/layout.tsx: Schibsted Grotesk drives the Panoply lockup only, never
// body copy, which stays Archivo throughout the console.
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
  title: 'Panoply Operations',
  // Belt and braces with the X-Robots-Tag the proxy sets on every admin
  // response. A console that turns up in a search index has already lost
  // something, even if every page behind it is authenticated.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // type-dashboard repoints --font-sans and --font-display at Archivo for
      // this whole tree, so every font-sans utility below re-resolves through
      // it without a single component naming a family. Same mechanism the
      // dashboard uses; see the role block in styles/tailwind.css.
      className={`type-dashboard font-sans ${archivo.variable} ${plexMono.variable} ${schibsted.variable}`}
    >
      <body className="min-h-screen bg-ds-surface text-ds-text antialiased">
        <a href="#admin-main" className="skip-link">
          Skip to main content
        </a>
        {children}
        <Toaster position="bottom-right" theme="dark" richColors />
      </body>
    </html>
  );
}
