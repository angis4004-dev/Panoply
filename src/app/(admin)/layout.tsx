import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../../styles/tailwind.css';
import { Toaster } from 'sonner';
import { Cormorant_Garamond, Geist, Geist_Mono, Schibsted_Grotesk } from 'next/font/google';

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
 * tokens and the same Geist face as the rest of the site. Two products that
 * clearly belong to one company, distinguished by what they say rather than
 * by an unrelated palette. Loaded again here because this root layout shares
 * no tree with (site)/layout.tsx.
 */

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

// Headlines, upright only - the same serif as the trader application.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal'],
  variable: '--font-serif',
});

// Hashes, addresses, amounts and timestamps. Tabular figures stop columns
// jittering as values change, which on a queue that refreshes is the
// difference between scannable and seasick.
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

// The wordmark face, matching the trader application. See the longer note in
// (site)/layout.tsx: Schibsted Grotesk drives the Panoply lockup only, never
// body copy, which is Geist throughout the console.
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
      // type-dashboard resolves --font-sans and --font-display for this whole
      // tree; see the role block in styles/tailwind.css.
      className={`type-dashboard font-sans ${geist.variable} ${geistMono.variable} ${cormorant.variable} ${schibsted.variable}`}
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
