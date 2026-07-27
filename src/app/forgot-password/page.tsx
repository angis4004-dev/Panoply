'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Mail } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E13] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <AppLogo size={32} />
          <span className="text-xl font-bold text-[#E7ECF2] tracking-tight">Aegis</span>
        </div>

        <div className="bg-[#122131] border border-[#212A35] rounded-2xl p-6">
          {submitted ? (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-[#3D77FF]" />
              </div>
              <h2 className="text-lg font-bold text-[#E7ECF2] mb-2">Check your email</h2>
              <p className="text-sm text-[#8B95A5]">
                If an account exists for <span className="text-[#E7ECF2]">{email}</span>, we&apos;ve
                sent a link to reset your password. The link expires in 1 hour.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-[#E7ECF2] mb-1">Forgot your password?</h2>
              <p className="text-sm text-[#8B95A5] mb-5">
                Enter your email address and we&apos;ll send you a link to reset it.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-medium text-[#8B95A5] mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-[#2A3542] bg-[#212A35]/60 px-4 py-2.5 text-sm text-[#E7ECF2] outline-none focus:border-primary"
                    placeholder="you@example.com"
                  />
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-[#0A0E13] transition hover:bg-[#3D77FF] disabled:opacity-60"
                >
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            </>
          )}

          <Link
            href="/sign-up-login-screen"
            className="mt-5 flex items-center justify-center gap-1.5 text-sm text-[#8B95A5] hover:text-[#E7ECF2]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
