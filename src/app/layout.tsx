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
        <AuthProvider>
          <AppStoreProvider>{children}</AppStoreProvider>
        </AuthProvider>
        <Toaster position="bottom-right" theme="dark" richColors />
      </body>
    </html>
  );
}
