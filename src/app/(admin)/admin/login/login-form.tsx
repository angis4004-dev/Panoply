'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, KeyRound, Lock, Mail } from 'lucide-react';

/**
 * Two steps, two requests, one form.
 *
 * The password step returns no session - only a short-lived challenge cookie
 * the browser holds and never exposes to this code. That is why the PIN step
 * sends nothing but the PIN: there is no token in a JavaScript variable here
 * for an injected script to steal and complete the sign-in with elsewhere.
 *
 * Visually it borrows the trader sign-in screen: icon-led inputs on
 * ds-surface-inset, cream focus ring, 44px minimum touch height.
 */

type Step = 'password' | 'pin' | 'set-pin';

const FIELD =
  'w-full min-h-[44px] rounded-lg border border-ds-border bg-ds-surface-inset py-2.5 pl-9 pr-4 text-ds-body text-ds-text placeholder-ds-text-muted transition duration-fast ease-ds-out focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40';

const LABEL = 'mb-1.5 block text-ds-caption uppercase text-ds-text-muted';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  const [step, setStep] = React.useState<Step>('password');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [pin, setPin] = React.useState('');
  const [confirmPin, setConfirmPin] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? 'Unable to sign in.');
        return;
      }
      // The password is not kept once it has been exchanged.
      setPassword('');
      setStep(payload.step === 'set-pin' ? 'set-pin' : 'pin');
    } catch {
      setError('Unable to reach the authentication service.');
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = step === 'set-pin' ? { pin, confirmPin } : { pin };
      const response = await fetch('/api/admin/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.code === 'challenge_expired') {
          setStep('password');
          setPin('');
          setConfirmPin('');
        }
        setError(payload.error ?? 'Unable to sign in.');
        return;
      }

      // An account still carrying a provisional password goes to the account
      // page and nowhere else, which is also what the server-side guard does.
      const destination = payload.admin?.mustChangePassword
        ? '/admin/account?setup=1'
        : next && next.startsWith('/admin')
          ? next
          : '/admin';
      router.replace(destination);
      router.refresh();
    } catch {
      setError('Unable to reach the authentication service.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={step === 'password' ? submitPassword : submitPin}
      className="space-y-5 rounded-ds-md border border-ds-border bg-ds-surface-raised/70 p-6 shadow-xl shadow-black/30"
      noValidate
    >
      {/* Two dots, not a progress bar. The flow is two steps and always two
          steps; a bar implies it might be longer. */}
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="h-1 w-8 rounded-full bg-primary" />
        <span
          className={`h-1 w-8 rounded-full transition-colors duration-base ease-ds-out ${
            step === 'password' ? 'bg-ds-border-strong' : 'bg-primary'
          }`}
        />
      </div>

      {step === 'password' && (
        <>
          <div>
            <label htmlFor="admin-email" className={LABEL}>
              Email
            </label>
            <div className="relative">
              <Mail
                size={15}
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ds-text-muted"
              />
              <input
                id="admin-email"
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={FIELD}
              />
            </div>
          </div>
          <div>
            <label htmlFor="admin-password" className={LABEL}>
              Password
            </label>
            <div className="relative">
              <Lock
                size={15}
                aria-hidden="true"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ds-text-muted"
              />
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${FIELD} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded text-ds-text-muted transition-colors duration-fast ease-ds-out hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </>
      )}

      {step !== 'password' && (
        <>
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2.5">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-ds-caption font-normal leading-relaxed tracking-normal text-ds-text-secondary">
              {step === 'set-pin'
                ? 'Choose a six-digit PIN. It is the second factor on every sign-in from now on, and it is separate from any PIN on your trading account.'
                : 'Password accepted. Enter your six-digit PIN to finish signing in.'}
            </p>
          </div>

          <div>
            <label htmlFor="admin-pin" className={LABEL}>
              PIN
            </label>
            <input
              id="admin-pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              className="w-full min-h-[44px] rounded-lg border border-ds-border bg-ds-surface-inset px-4 py-2.5 text-center font-mono text-ds-title tabular-nums tracking-[0.5em] text-ds-text transition duration-fast ease-ds-out focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {step === 'set-pin' && (
            <div>
              <label htmlFor="admin-pin-confirm" className={LABEL}>
                Confirm PIN
              </label>
              <input
                id="admin-pin-confirm"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={confirmPin}
                onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ''))}
                className="w-full min-h-[44px] rounded-lg border border-ds-border bg-ds-surface-inset px-4 py-2.5 text-center font-mono text-ds-title tabular-nums tracking-[0.5em] text-ds-text transition duration-fast ease-ds-out focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}
        </>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-ds-value-negative/30 bg-ds-value-negative/[0.08] px-3 py-2 text-ds-caption font-normal leading-relaxed tracking-normal text-ds-value-negative"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full min-h-[44px] rounded-lg bg-primary px-4 text-ds-label font-semibold tracking-normal text-primary-foreground transition duration-fast ease-ds-out hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Working…' : step === 'password' ? 'Continue' : 'Sign in'}
      </button>
    </form>
  );
}
