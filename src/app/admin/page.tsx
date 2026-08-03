'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AegisAdminDashboard from '@/components/aegis-admin-dashboard';
import { useAuth } from '@/context/AuthContext';

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait for the session check to finish before deciding to redirect -
    // otherwise a real admin gets bounced on every hard refresh, since
    // `user` starts out null until /api/auth/session resolves.
    if (loading) return;

    // Redirect to sign-in if not authenticated
    if (user === null) {
      router.replace('/sign-up-login-screen?mode=login');
      return;
    }

    // Redirect to dashboard if not admin (this is a backup - middleware should handle this)
    if (user.role !== 'Admin') {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  // Show loading state while checking auth
  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-zinc-400 px-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-xl shadow-black/40">
          <div className="mb-4 h-12 w-12 rounded-full border border-cyan-500/30 bg-cyan-500/10 flex items-center justify-center text-cyan-300 animate-pulse">
            <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path
                d="M22 12a10 10 0 00-10-10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-white">Verifying admin access...</p>
          <p className="mt-2 text-sm text-zinc-500">
            If you are not signed in, you will be redirected to login.
          </p>
        </div>
      </div>
    );
  }

  return <AegisAdminDashboard />;
}
