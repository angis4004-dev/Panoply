'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';
import { AegisMark } from '@/components/ui/AegisLogo';

export function Navbar() {
  const { user } = useAppStore();
  const { logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '#bots', label: 'Bots' },
    { href: '#bots', label: 'Charts' },
    { href: '#pricing', label: 'Pricing' },
    { href: '/about', label: 'About' },
  ];

  return (
    <nav className="fixed top-0 w-full z-50">
      <div className="bg-[#0A0E13]/90 backdrop-blur-md border-b border-[#212A35]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <AegisMark size={28} />
              <span className="text-xl font-bold text-white tracking-wide">AEGIS</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm text-[#8B95A5] hover:text-[#E7ECF2] transition-colors"
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
                    className="px-4 py-2 text-sm font-medium text-[#F2F5FA] bg-primary hover:bg-[#3D77FF] rounded-lg transition-colors"
                  >
                    Launch App
                  </Link>
                  <button
                    onClick={logout}
                    className="p-2 text-[#8B95A5] hover:text-[#E7ECF2] transition-colors"
                    aria-label="Log out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/sign-up-login-screen"
                    className="px-4 py-2 text-sm font-medium text-primary border border-primary/40 hover:bg-primary/10 rounded-lg transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/sign-up-login-screen"
                    className="px-4 py-2 text-sm font-semibold text-[#F2F5FA] bg-primary hover:bg-[#3D77FF] rounded-lg transition-colors"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>

            <button
              onClick={() => setIsMenuOpen(true)}
              className="md:hidden p-2 text-[#E7ECF2]"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="fixed inset-0 z-50 bg-[#0A0E13]/95 backdrop-blur-sm md:hidden">
          <div className="flex flex-col h-full p-6">
            <div className="flex justify-end mb-8">
              <button onClick={() => setIsMenuOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5 text-[#E7ECF2]" />
              </button>
            </div>
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="px-4 py-3 text-lg text-[#E7ECF2] hover:bg-[#17202e] rounded-lg"
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
                    className="w-full text-center px-4 py-3 text-sm font-semibold text-[#F2F5FA] bg-primary rounded-lg"
                  >
                    Launch App
                  </Link>
                  <button
                    onClick={logout}
                    className="w-full px-4 py-3 text-sm text-[#E7ECF2] border border-[#212A35] rounded-lg"
                  >
                    Log Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/sign-up-login-screen"
                    className="w-full text-center px-4 py-3 text-sm font-semibold text-[#F2F5FA] bg-primary rounded-lg"
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
