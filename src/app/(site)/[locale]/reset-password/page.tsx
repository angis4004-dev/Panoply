'use client';

import { Suspense, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import PanoplyLogo from '@/components/ui/PanoplyLogo';
import { Loader } from '@/components/ui/loader';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to reset password.');
      }

      setSuccess(true);
      setTimeout(() => router.push('/sign-up-login-screen'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E13] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <PanoplyLogo size={32} className="text-brand-cream" wordmarkClassName="text-xl" />
        </div>

        <div className="bg-[#122131] border border-[#212A35] rounded-2xl p-6">
          {!token ? (
            <div className="text-center py-4">
              <h2 className="text-lg font-bold text-[#E7ECF2] mb-2">Invalid reset link</h2>
              <p className="text-sm text-[#8B95A5] mb-4">
                This password reset link is missing or malformed. Request a new one below.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Request new link
              </Link>
            </div>
          ) : success ? (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-[#E7ECF2] mb-2">Password updated</h2>
              <p className="text-sm text-[#8B95A5]">Redirecting you to sign in...</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-[#E7ECF2] mb-1">Set a new password</h2>
              <p className="text-sm text-[#8B95A5] mb-5">
                Choose a new password for your Panoply account.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-medium text-[#8B95A5] mb-1.5"
                  >
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[#2A3542] bg-[#212A35]/60 px-4 py-2.5 text-sm text-[#E7ECF2] outline-none focus:border-primary"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-xs font-medium text-[#8B95A5] mb-1.5"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-[#2A3542] bg-[#212A35]/60 px-4 py-2.5 text-sm text-[#E7ECF2] outline-none focus:border-primary"
                    placeholder="Re-enter password"
                  />
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading && <Loader size={16} />}
                  <span>{loading ? 'Updating…' : 'Update password'}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0A0E13]">
          <Loader size={48} label="Loading" className="text-primary" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
