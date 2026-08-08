'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'Admin' | 'Trader' | null;

export interface AuthUser {
  email: string;
  role: UserRole;
  name: string;
  kycStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
  tier?: 'unverified' | 'novice' | 'amateur' | 'strategist' | 'vanguard';
  xp?: number;
  emailVerified?: boolean;
  walletOwnershipConfirmed?: boolean;
  walletAddress?: string;
  /**
   * Whether a sign-in PIN has been chosen. Setting one happens in the
   * dashboard rather than during sign-up, so the app has to be able to tell
   * "no PIN yet" from "PIN already set" in order to prompt for it.
   */
  hasPin?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Rehydrate the logged-in user from the server-verified session cookie.
    // The session cookie itself is httpOnly, so this is the only way the
    // client can know who's signed in after a hard page load/refresh.
    fetch('/api/auth/session')
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data) => setUserState(data.user))
      .catch(() => setUserState(null))
      .finally(() => setLoading(false));
  }, []);

  const setUser = (u: AuthUser | null) => {
    setUserState(u);
    // Note: We no longer use sessionStorage - auth is managed via cookies
    // This function is kept for compatibility with existing code
  };

  const logout = () => {
    setUser(null);
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {
      // Client state is already cleared; a failed request just leaves the
      // cookie to expire naturally rather than blocking the UI logout.
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
