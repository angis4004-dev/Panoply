'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';

// Import cookie utilities for client-side cookie reading
import { getCookie } from '@/lib/cookie-utils.client';

export type UserRole = 'Admin' | 'Trader' | null;

export interface AuthUser {
  email: string;
  role: UserRole;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  setUser: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);

  useEffect(() => {
    // Try to get user from cookie on client side
    const userData = getCookie('auth_user');
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setUserState(parsed);
      } catch (e) {
        console.error('Failed to parse user from cookie:', e);
      }
    }
  }, []);

  const setUser = (u: AuthUser | null) => {
    setUserState(u);
    // Note: We no longer use sessionStorage - auth is managed via cookies
    // This function is kept for compatibility with existing code
  };

  const logout = () => {
    setUser(null);
    // In a real implementation, we might want to call an API to clear the session
    // For now, we rely on the cookie expiration or manual clearance
  };

  return <AuthContext.Provider value={{ user, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
