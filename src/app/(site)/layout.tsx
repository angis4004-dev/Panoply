import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../../styles/tailwind.css';
import '@/lib/chartSetup';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  IBM_Plex_Sans_Arabic,
  Schibsted_Grotesk,
} from 'next/font/google';
import { cn } from '@/lib/utils';
import { SUPPORT_EMAIL } from '@/lib/contact';

/*
 * Typefaces are loaded here but not assigned here.
 *
 * Each family owns a variable named after itself (--font-geist, --font-mono,
 * ...). Two role variables, --font-sans and --font-display, point at whichever
 * family fills that role, and Tailwind's `font-sans` and `font-display` read
 * only the roles. See the role definitions in styles/tailwind.css.
 *
 * Geist is the body face everywhere, and the whole face of the dashboard and
 * console. It replaced Tahoma (absent on iOS and Android, so phones never
 * showed the face a laptop did) and Archivo in the app.
 *
 * Marketing headlines are Cormorant Garamond, upright only. It replaced
 * Instrument Serif, whose single 400 weight read faintly on a phone and whose
 * italic carried the hero. Cormorant has real 500-700 weights, so headings
 * pair `font-display` with `font-semibold` instead of synthesising a bold.
 * Only `style: 'normal'` is loaded: no italic file exists to reach for.
 */
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal'],
  variable: '--font-serif',
});

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

/* Figures, prices and addresses. Geist Mono shares Geist's proportions, so a
   number sitting inside a sentence does not change the colour of the line. */
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

/*
 * The wordmark face, and only the wordmark.
 *
 * Schibsted Grotesk is what the Panoply logo is drawn in, so the lockup in the
 * navbar, the footer and the console has to be set in it or the rendered
 * wordmark stops matching the brand sheet. It deliberately does not feed
 * --font-sans: everything else is Geist.
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

/*
 * Arabic coverage, for machine-translated pages.
 *
 * The site ships in English only; readers of other languages are served by
 * Chrome's and Safari's own translation. When one of them renders this page
 * in Arabic it swaps the text in place and leaves the CSS alone - so the
 * glyphs resolve against the stack below, and none of the four Latin families
 * above contains a single Arabic character. Without this the whole page falls
 * back to whatever the operating system happens to substitute.
 *
 * Costs nothing to carry: next/font emits a unicode-range for the Arabic
 * subset, so the file is only ever fetched once an Arabic character actually
 * needs to be drawn. An English reader never downloads it.
 *
 * Appended to the stack in styles/tailwind.css rather than swapping it, so a
 * Latin name inside Arabic text still renders in Geist.
 */
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://panoply.finance';
const TITLE = 'Panoply | Quantitative Intelligence for Decentralized Finance';
const DESCRIPTION =
  'Panoply is a quantitative DeFi automation platform combining signal generation, automated execution, and risk management across secure sign-in, portfolio insights, vault discovery, and yield analysis.';

/**
 * What a pasted link turns into.
 *
 * WhatsApp, X, LinkedIn, iMessage and Slack all read these tags and draw a
 * card from them. Without og:image and og:title the site had only a
 * description, so a shared link rendered as a bare blue URL - which for a
 * platform asking people to deposit money is the first impression it makes.
 *
 * The image itself is src/app/(site)/opengraph-image.png, picked up by Next
 * from its filename; twitter-image.png is the same picture under the name X
 * looks for. Both are generated from the one logo definition by
 * scripts/generate-brand-assets.mjs.
 *
 * `metadataBase` is what turns those into absolute URLs. Without it Next
 * emits a relative path, and a relative og:image is ignored by every client
 * that fetches the page from outside the browser - which is all of them.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // No title template: the pages that have their own titles already end in
  // "| Panoply", and a template would make that "Privacy Policy | Panoply |
  // Panoply" on every one of them.
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'Panoply',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Panoply',
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    /*
     * lang="en" is a truthful declaration, and it is the whole mechanism by
     * which translation reaches non-English readers.
     *
     * Chrome and Edge compare this against the reader's own languages and
     * offer to translate when they differ; Safari uses it to populate its
     * Translate menu. Getting it wrong is worse than useless - the previous
     * locale routing served English prose under lang="ja" on /ja, which told
     * a Japanese reader's browser the page was already in their language.
     *
     * So: no dynamic locale here, and nothing that suppresses translation.
     * The only translate="no" markers in the codebase sit on wallet addresses,
     * memo tags and ticker symbols, where a rewritten character loses money.
     */
    <html
      lang="en"
      className={cn(
        'font-sans',
        geist.variable,
        geistMono.variable,
        cormorant.variable,
        schibsted.variable,
        plexArabic.variable
      )}
    >
      <body className="bg-[#0A0E13] text-[#E7ECF2] antialiased">
        {/*
          Structured data, for the search engines that read it.
          What Google does with an Organization block is show the mark beside
          the site in results and in its knowledge panel - the same picture a
          pasted link gets from og:image, in the other place people meet the
          name. Every field here is stated elsewhere on the site: nothing is
          claimed to a crawler that a reader cannot check.
          public/logo.png is used rather than the app's own icons, whose URLs
          carry a build hash and change under a crawler's feet.
        */}
        <script
          type="application/ld+json"
          // The content is built here from constants, not from user input.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Panoply',
              url: SITE_URL,
              logo: `${SITE_URL}/logo.png`,
              description: DESCRIPTION,
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'customer support',
                email: SUPPORT_EMAIL,
              },
            }),
          }}
        />
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
