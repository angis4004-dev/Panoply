'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { useAuth } from '@/hooks/use-auth';

const PIN_LENGTH = 6;

/**
 * Sign-in PIN panel for the settings page. Handles both jobs:
 *
 *   no PIN yet  -> "Set a PIN", two fields, POST /api/auth/pin/set
 *   PIN exists  -> "Change PIN", three fields, POST /api/auth/pin/change
 *
 * Choosing the first PIN lives here rather than in sign-up. Wedged into the
 * auth flow it was an unexplained demand for a second secret standing between
 * a new user and the product; here it can say what the PIN is for and be come
 * back to.
 *
 * Collapsed behind a button by default. Three PIN fields permanently open is a
 * lot of weight for something most people touch once, and an always-visible
 * "current PIN" box on a shared screen invites someone to fill it in and walk
 * away.
 */
export function PinSection() {
  const { addToast } = useAppStore();
  const { user, setUser } = useAuth();
  const hasPin = user?.hasPin ?? false;

  const [open, setOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Matches PinStep and /reset-pin: filter at input time so the field can never
  // hold something the server would reject.
  const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH);

  const close = () => {
    setCurrentPin('');
    setPin('');
    setConfirmPin('');
    setError(null);
    setOpen(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (pin.length !== PIN_LENGTH || (hasPin && currentPin.length !== PIN_LENGTH)) {
      setError(`Each PIN must be exactly ${PIN_LENGTH} digits.`);
      return;
    }
    if (pin !== confirmPin) {
      setError(hasPin ? 'The two new PINs do not match.' : 'The two PINs do not match.');
      return;
    }
    if (hasPin && pin === currentPin) {
      setError('Your new PIN must be different from your current one.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(hasPin ? '/api/auth/pin/change' : '/api/auth/pin/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hasPin ? { currentPin, pin, confirmPin } : { pin, confirmPin }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error || 'Unable to save your PIN.');
        // Only the current-PIN field is cleared on a rejection. Wiping the new
        // PIN too would make the user retype a value that was never the
        // problem.
        setCurrentPin('');
        return;
      }

      // Flips the panel from "Set a PIN" to "Change PIN" and clears the
      // dashboard prompt without waiting for a session refetch.
      if (user) setUser({ ...user, hasPin: true });

      addToast(hasPin ? 'PIN updated. Other devices have been signed out.' : 'PIN set.', 'success');
      close();
    } catch {
      setError('Unable to reach the authentication service.');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    autoComplete: string
  ) => (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ds-text-muted">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        maxLength={PIN_LENGTH}
        value={value}
        onChange={(e) => onChange(onlyDigits(e.target.value))}
        disabled={saving}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? 'pin-section-error' : undefined}
        className="w-full min-h-[44px] rounded-lg border border-ds-border-strong bg-ds-border/60 px-4 py-2.5 text-sm text-ds-text outline-none focus:border-primary"
        placeholder={`${PIN_LENGTH} digits`}
      />
    </div>
  );

  return (
    <section id="pin" className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ds-text-muted">
        Security
      </h2>

      {!open ? (
        <div>
          <p className="mb-3 text-sm text-ds-text">Sign-in PIN</p>
          <p className="mb-4 text-xs text-ds-text-muted">
            {hasPin
              ? 'The 6-digit PIN you enter after your password. Changing it signs out every other device.'
              : 'A 6-digit PIN adds a second step after your password, so a stolen password is not enough to reach your account on its own.'}
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-[44px] rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised"
          >
            {hasPin ? 'Change PIN' : 'Set a PIN'}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {hasPin && field('currentPin', 'Current PIN', currentPin, setCurrentPin, 'off')}
          {field('newPin', hasPin ? 'New PIN' : 'PIN', pin, setPin, 'new-password')}
          {field(
            'confirmNewPin',
            hasPin ? 'Confirm new PIN' : 'Confirm PIN',
            confirmPin,
            setConfirmPin,
            'new-password'
          )}

          <p className="text-xs text-ds-text-muted">Avoid repeated digits and simple sequences.</p>

          {error && (
            <p
              id="pin-section-error"
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-[var(--ds-value-negative)]/40 bg-[var(--ds-value-negative)]/10 px-3 py-2 text-sm text-[var(--ds-value-negative)]"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : hasPin ? 'Update PIN' : 'Set PIN'}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-ds-text-muted transition-colors hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Cancel
            </button>
          </div>

          {hasPin && (
            <p className="text-xs text-ds-text-muted">
              Forgotten it? Sign out, then use &ldquo;Forgot your PIN?&rdquo; on the PIN step.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
