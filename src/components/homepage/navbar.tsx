'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';

export function Navbar() {
  // Reads the session directly rather than through the app store. The store
  // now lives inside the dashboard's PIN gate, so it does not exist out here -
  // and it only ever mirrored the auth context's user anyway.
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/signal-flows', label: 'Signal Flows' },
    { href: '/charts', label: 'Charts' },
    { href: '/tiers', label: 'Tiers' },
    { href: '/about', label: 'About' },
  ];

  return (
    <nav className="fixed top-0 w-full z-50">
      <div className="bg-ds-surface/90 backdrop-blur-md border-b border-ds-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link
              href="/"
              className="flex min-h-[44px] items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
            >
              <PanoplyMark size={28} className="text-brand-cream" />
              <span className="font-wordmark text-xl font-normal tracking-normal text-brand-cream">
                Panoply
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="inline-flex min-h-[44px] items-center rounded px-1 text-sm text-ds-text-muted transition-colors duration-fast ease-ds-out hover:text-[#E7ECF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
                  >
                    Launch App
                  </Link>
                  <button
                    onClick={logout}
                    className="rounded-lg p-2 text-ds-text-muted transition-colors hover:text-[#E7ECF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
                    aria-label="Log out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/sign-up-login-screen"
                    className="px-4 py-2 text-sm font-medium text-primary border border-primary/40 hover:bg-primary/10 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/sign-up-login-screen"
                    className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>

            <button
              onClick={() => setIsMenuOpen(true)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-[#E7ECF2] md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="fixed inset-0 z-50 bg-ds-surface/95 backdrop-blur-sm md:hidden">
          <div className="flex flex-col h-full p-6">
            <div className="flex justify-end mb-8">
              <button
                onClick={() => setIsMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <X className="h-5 w-5 text-[#E7ECF2]" />
              </button>
            </div>
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="rounded-lg px-4 py-3 text-lg text-[#E7ECF2] transition-colors duration-fast ease-ds-out hover:bg-ds-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-3">
              {user ? (
                <>
                  <Link
                    href="/dashboard"
                    className="w-full text-center px-4 py-3 text-sm font-semibold text-primary-foreground bg-primary rounded-lg"
                  >
                    Launch App
                  </Link>
                  <button
                    onClick={logout}
                    className="w-full px-4 py-3 text-sm text-[#E7ECF2] border border-ds-border rounded-lg"
                  >
                    Log Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/sign-up-login-screen"
                    className="w-full text-center px-4 py-3 text-sm font-semibold text-primary-foreground bg-primary rounded-lg"
                  >
                    Get Started
                  </Link>
                  <Link
                    href="/sign-up-login-screen"
                    className="w-full text-center px-4 py-3 text-sm text-primary border border-primary/40 rounded-lg"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
