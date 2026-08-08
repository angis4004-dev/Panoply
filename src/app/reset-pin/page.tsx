'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';

const PIN_LENGTH = 6;

/**
 * Landing page for the link sent by POST /api/auth/pin/forgot.
 *
 * Deliberately shaped like /reset-password rather than like the in-flow
 * PinStep: this is reached cold from an inbox, possibly on a different device,
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

  // Same input-time filtering PinStep uses: the field can never hold something
  // the server would reject, so nobody is told off for a character the form let
  // them type.
  const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH);

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
        <div className="flex items-center gap-3 mb-8 justify-center">
          <AppLogo size={32} />
          <span className="text-xl font-bold text-[#E7ECF2] tracking-tight">Aegis</span>
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
                Pick a new 6-digit PIN. You will enter it after your password each time you sign in.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="pin"
                    className="block text-xs font-medium text-ds-text-muted mb-1.5"
                  >
                    New PIN
                  </label>
                  <input
                    id="pin"
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={PIN_LENGTH}
                    required
                    value={pin}
                    onChange={(e) => setPin(onlyDigits(e.target.value))}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={error ? 'pin-error' : 'pin-hint'}
                    className="w-full min-h-[44px] rounded-lg border border-ds-border-strong bg-ds-border/60 px-4 py-2.5 text-sm text-[#E7ECF2] outline-none focus:border-primary"
                    placeholder="6 digits"
                  />
                </div>
                <div>
                  <label
                    htmlFor="confirmPin"
                    className="block text-xs font-medium text-ds-text-muted mb-1.5"
                  >
                    Confirm new PIN
                  </label>
                  <input
                    id="confirmPin"
                    name="confirmPin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={PIN_LENGTH}
                    required
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(onlyDigits(e.target.value))}
                    className="w-full min-h-[44px] rounded-lg border border-ds-border-strong bg-ds-border/60 px-4 py-2.5 text-sm text-[#E7ECF2] outline-none focus:border-primary"
                    placeholder="Repeat your PIN"
                  />
                </div>

                <p id="pin-hint" className="text-xs text-ds-text-muted">
                  {pin.length}/{PIN_LENGTH} digits — avoid repeated digits and simple sequences
                </p>

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
                  className="w-full min-h-[44px] rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
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
        <div className="flex min-h-screen items-center justify-center bg-ds-surface text-sm text-ds-text-muted">
          Loading…
        </div>
      }
    >
      <ResetPinContent />
    </Suspense>
  );
}
