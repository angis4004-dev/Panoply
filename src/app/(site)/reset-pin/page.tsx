'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import PanoplyLogo from '@/components/ui/PanoplyLogo';
import { Loader } from '@/components/ui/loader';
import { PinInput, PIN_LENGTH } from '@/components/auth/pin-input';

/**
 * Landing page for the link sent by POST /api/auth/pin/forgot.
 *
 * Deliberately shaped like /reset-password rather than like the in-flow
 * The dashboard PIN gate: this is reached cold from an inbox, possibly on a different device,
 * so it has to explain itself without any of the sign-in context. It ends at
 * "you can now sign in" because the reset grants no session - see the note on
 * the reset route for why the link must not be enough on its own.
 */
function ResetPinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length !== PIN_LENGTH) {
      setError(`Your PIN must be exactly ${PIN_LENGTH} digits.`);
      return;
    }
    if (pin !== confirmPin) {
      setError('The two PINs do not match.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/pin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin, confirmPin }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to reset your PIN.');
      }

      setSuccess(true);
      setTimeout(() => router.push('/sign-up-login-screen'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset your PIN.');
      setPin('');
      setConfirmPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ds-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* The lockup component, not a hand-assembled mark plus span. The
            wordmark has to be Schibsted Grotesk at 400 in cream; written out by
            hand here it was the body font at bold weight in near-white. */}
        <div className="mb-8 flex justify-center">
          <PanoplyLogo size={32} className="text-brand-cream" wordmarkClassName="text-xl" />
        </div>

        <div className="bg-ds-surface-raised border border-ds-border rounded-2xl p-6">
          {!token ? (
            <div className="text-center py-4">
              <h2 className="text-lg font-bold text-[#E7ECF2] mb-2">Invalid reset link</h2>
              <p className="text-sm text-ds-text-muted mb-4">
                This PIN reset link is missing or malformed. Start a sign-in and use &ldquo;Forgot
                your PIN?&rdquo; to get a new one.
              </p>
              <Link
                href="/sign-up-login-screen"
                className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Go to sign in
              </Link>
            </div>
          ) : success ? (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-[#E7ECF2] mb-2">PIN updated</h2>
              <p className="text-sm text-ds-text-muted">
                Sign in with your password and your new PIN. Redirecting…
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-[#E7ECF2] mb-1">Choose a new PIN</h2>
              <p className="text-sm text-ds-text-muted mb-5">
                Six digits, entered after your password each time you sign in.
              </p>

              {/* The six boxes the dashboard gate and the settings panel use.
                  Reached cold from an inbox, this is often the first time
                  someone sees the control - it should be the same one they
                  meet everywhere afterwards. */}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <span className="mb-2 block text-xs font-medium text-ds-text-muted">New PIN</span>
                  <PinInput
                    align="start"
                    idPrefix="new-pin"
                    label="New PIN"
                    value={pin}
                    onChange={(next) => {
                      setPin(next);
                      if (error) setError(null);
                    }}
                    invalid={Boolean(error)}
                    describedBy={error ? 'pin-error' : undefined}
                    disabled={loading}
                  />
                </div>
                <div>
                  <span className="mb-2 block text-xs font-medium text-ds-text-muted">
                    Confirm new PIN
                  </span>
                  <PinInput
                    align="start"
                    idPrefix="confirm-pin"
                    label="Confirm new PIN"
                    value={confirmPin}
                    onChange={(next) => {
                      setConfirmPin(next);
                      if (error) setError(null);
                    }}
                    invalid={Boolean(error)}
                    autoFocus={false}
                    disabled={loading}
                  />
                </div>

                {error && (
                  <p
                    id="pin-error"
                    role="alert"
                    aria-live="polite"
                    className="rounded-lg border border-[var(--ds-value-negative)]/40 bg-[var(--ds-value-negative)]/10 px-3 py-2 text-sm text-[var(--ds-value-negative)]"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || pin.length !== PIN_LENGTH}
                  className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && <Loader size={16} />}
                  {loading ? 'Updating…' : 'Update PIN'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ds-surface">
          <Loader size={48} label="Loading" className="text-primary" />
        </div>
      }
    >
      <ResetPinContent />
    </Suspense>
  );
}
