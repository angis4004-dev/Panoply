import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../styles/tailwind.css';
import '@/lib/chartSetup';
import { AuthProvider } from '@/context/AuthContext';
import { AppStoreProvider } from '@/store/app-store';
import { Sora } from 'next/font/google';
import { cn } from '@/lib/utils';

const sora = Sora({ subsets: ['latin'], variable: '--font-sans' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Aegis — AI-First Crypto Intelligence',
  description:
    'Aegis is an AI-first crypto intelligence workspace for secure sign-in, portfolio insights, vault discovery, yield analysis, and trading workflows.',
  icons: {
    icon: { url: '/favicon.ico', type: 'image/x-icon' },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn('font-sans', sora.variable)}>
      <body className="bg-[#0A0E13] text-[#E7ECF2] antialiased">
        <AuthProvider>
          <AppStoreProvider>{children}</AppStoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
