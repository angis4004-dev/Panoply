import { useContext } from 'react';
import { AuthContext } from '@/context/AuthContext';

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  const { user, setUser } = context;

  const signIn = async (email: string, password: string) => {
    const res = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to sign in');
    }

    const result = await res.json();
    setUser(result.user);
    return result;
  };

  const signInDemo = async () => {
    return signIn('alex.thornton@cryptotradeai.io', 'TraderBot#2024');
  };

  return {
    user,
    setUser,
    logout: context.logout,
    signIn,
    signInDemo,
  };
}
