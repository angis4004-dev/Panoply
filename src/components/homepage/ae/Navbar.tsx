'use client';

import Link from 'next/link';
import { useAppStore } from '@/store/app-store';
import {
  Store,
  Brain,
  Bot,
  Vault,
  Zap,
  SunMoon,
  LogIn,
  SlidersHorizontal,
  User,
  Shield,
} from 'lucide-react';

export default function Navbar() {
  const { user } = useAppStore();

  return (
    <nav className="bg-background/60 backdrop-blur-sm border-b border-border/5 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
        {/* Left side: Logo and brand */}
        <div className="flex-shrink-0 flex items-center space-x-3">
          {/* Logo placeholder - you can replace with actual logo */}
          <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <span className="text-xl font-bold text-primary">Aegis</span>
        </div>

        {/* Center: Navigation links */}
        <div className="hidden md:flex space-x-8">
          <a
            href="#features"
            className="text-[#E7ECF2]/60 hover:text-[#E7ECF2]/80 transition-colors"
          >
            Features
          </a>
          <Link
            href="/dashboard/ai"
            className="text-[#E7ECF2]/60 hover:text-[#E7ECF2]/80 transition-colors"
          >
            AI Command Center
          </Link>
          <Link
            href="/dashboard/bots"
            className="text-[#E7ECF2]/60 hover:text-[#E7ECF2]/80 transition-colors"
          >
            Trading Bots
          </Link>
          <Link
            href="/dashboard/vaults"
            className="text-[#E7ECF2]/60 hover:text-[#E7ECF2]/80 transition-colors"
          >
            Vaults
          </Link>
          <Link
            href="/dashboard/yield"
            className="text-[#E7ECF2]/60 hover:text-[#E7ECF2]/80 transition-colors"
          >
            Yield Intelligence
          </Link>
        </div>

        {/* Right side: Auth or user info */}
        <div className="flex items-center space-x-4">
          {!user ? (
            <>
              <Link href="/sign-up-login-screen">
                <button className="px-4 py-2 bg-transparent border border-[#D9A94E]/50 text-[#D9A94E] rounded hover:bg-[#D9A94E]/10 transition-colors">
                  Sign In
                </button>
              </Link>
              <Link href="/sign-up-login-screen">
                <button className="px-4 py-2 bg-primary text-[#1A1305] rounded hover:bg-primary/90 transition-colors">
                  Launch App
                </button>
              </Link>
            </>
          ) : (
            <>
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 bg-primary/20 rounded-lg flex items-center justify-center text-sm font-medium">
                  {user.name && String(user.name).length > 0
                    ? String(user.name).charAt(0)
                    : user.email && String(user.email).length > 0
                      ? String(user.email).split('@')[0]?.charAt(0) || 'U'
                      : 'U'}
                </div>
                <div className="text-sm font-medium text-foreground">
                  {user.name && String(user.name).length > 0
                    ? String(user.name)
                    : user.email && String(user.email).length > 0
                      ? String(user.email).split('@')[0] || 'User'
                      : 'User'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
