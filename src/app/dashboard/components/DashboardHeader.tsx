import React from 'react';
import Link from 'next/link';
import { Bell, Zap, User, LogOut, DollarSign, Wallet } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useRouter } from 'next/navigation';

export default function DashboardHeader() {
  const { user, logout } = useAppStore();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/sign-up-login-screen');
  };

  return (
    <div className="flex h-16 items-center justify-between px-4 bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-800/30 mb-6">
      {/* Left Side - Logo & Navigation */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white text-lg">Aegis Dashboard</h1>
            <p className="text-xs text-slate-400">AI-Powered Crypto Intelligence</p>
          </div>
        </div>

        {/* Quick Nav - Hidden on mobile */}
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-400 hover:text-slate-300 transition-colors">
          <Link href="/dashboard">Overview</Link>
          <Link href="/dashboard/bots">Bots</Link>
          <Link href="/dashboard/vaults">Vaults</Link>
          <Link href="/dashboard/yield">Yield</Link>
        </div>
      </div>

      {/* Right Side - User Actions */}
      <div className="flex items-center gap-3">
        {/* Wallet Connection */}
        {!user?.wallet && (
          <button
            onClick={() => {
              // Would connect wallet in real implementation
              alert('Wallet connection would trigger here');
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-slate-800/50 hover:bg-slate-700/70 rounded-lg border border-slate-700/50 transition-all"
          >
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </button>
        )}

        {/* User Info & Actions */}
        {user && (
          <>
            {/* Notifications */}
            <div className="relative">
              <Bell className="w-5 h-5 text-slate-400 hover:text-slate-300 transition-colors cursor-pointer" />
              {/* Notification badge */}
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
            </div>

            {/* User Avatar & Name */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">{user?.name?.charAt(0) || 'A'}</span>
              </div>
              <div className="hidden md:block">
                <span className="text-sm font-medium text-white">{user?.name || 'User'}</span>
              </div>
            </div>
          </>
        )}

        {/* Theme Toggle & User Menu */}
        <div className="relative">
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
            aria-label="User menu"
          >
            <LogOut className="w-4 h-4 text-slate-400 hover:text-white" />
          </button>
          {/* User menu dropdown */}
          <div className="absolute right-0 mt-2 w-56 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg shadow-lg z-50">
            <div className="space-y-1">
              <div className="px-4 py-3">
                <p className="text-xs text-slate-400">Welcome back,</p>
                <p className="text-sm font-semibold text-white">{user?.name || 'Alex Thornton'}</p>
                <p className="text-xs text-slate-500">{user?.email || 'user@email.com'}</p>
              </div>
              <div className="px-4 py-3 border-t border-slate-800/20">
                <button
                  onClick={() => router.push('/dashboard/settings')}
                  className="w-full text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800/50 px-3 py-1.5 rounded"
                >
                  <User className="w-4 h-4 mr-2" /> Settings
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-full text-left text-xs text-slate-300 hover:text-white hover:bg-slate-800/50 px-3 py-1.5 rounded"
                >
                  <Zap className="w-4 h-4 mr-2" /> Dashboard
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full text-left text-xs text-red-400 hover:text-red-300 hover:bg-slate-800/50 px-3 py-1.5 rounded"
                >
                  <LogOut className="w-4 h-4 mr-2" /> Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
