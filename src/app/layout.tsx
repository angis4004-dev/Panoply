import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../styles/tailwind.css';
import '@/lib/chartSetup';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { AppStoreProvider } from '@/store/app-store';
import { Sora, Orbitron } from 'next/font/google';
import { cn } from '@/lib/utils';

const sora = Sora({ subsets: ['latin'], variable: '--font-sans' });
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
    <html lang="en" className={cn('font-sans', sora.variable, orbitron.variable)}>
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
