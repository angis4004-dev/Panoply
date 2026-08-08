'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/app-store';

const PIN_LENGTH = 6;

/**
 * Change-PIN panel for the settings page.
 *
 * Collapsed behind a button by default. Three PIN fields permanently open on a
 * settings page is a lot of visual weight for something most people touch once,
 * and an always-visible "current PIN" box on a shared screen is an invitation
 * to fill it in and walk away.
 */
export function ChangePinSection() {
  const { addToast } = useAppStore();
  const [open, setOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Matches PinStep and /reset-pin: filter at input time so the field can never
  // hold something the server would reject.
  const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH);

  const reset = () => {
    setCurrentPin('');
    setPin('');
    setConfirmPin('');
    setError(null);
  };

  const close = () => {
    reset();
    setOpen(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (currentPin.length !== PIN_LENGTH || pin.length !== PIN_LENGTH) {
      setError(`Each PIN must be exactly ${PIN_LENGTH} digits.`);
      return;
    }
    if (pin !== confirmPin) {
      setError('The two new PINs do not match.');
      return;
    }
    if (pin === currentPin) {
      setError('Your new PIN must be different from your current one.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/auth/pin/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, pin, confirmPin }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error || 'Unable to change your PIN.');
        // Only the current-PIN field is cleared on a rejection. Wiping the new
        // PIN too would make the user retype a value that was never the
        // problem.
        setCurrentPin('');
        return;
      }

      addToast('PIN updated. Other devices have been signed out.', 'success');
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
        aria-describedby={error ? 'change-pin-error' : undefined}
        className="w-full min-h-[44px] rounded-lg border border-ds-border-strong bg-ds-border/60 px-4 py-2.5 text-sm text-[#E7ECF2] outline-none focus:border-primary"
        placeholder={`${PIN_LENGTH} digits`}
      />
    </div>
  );

  return (
    <section className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ds-text-muted">
        Security
      </h2>

      {!open ? (
        <div>
          <p className="mb-3 text-sm text-[#E7ECF2]">Sign-in PIN</p>
          <p className="mb-4 text-xs text-ds-text-muted">
            The 6-digit PIN you enter after your password. Changing it signs out every other device.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-[44px] rounded-lg border border-primary/40 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised"
          >
            Change PIN
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {field('currentPin', 'Current PIN', currentPin, setCurrentPin, 'off')}
          {field('newPin', 'New PIN', pin, setPin, 'new-password')}
          {field('confirmNewPin', 'Confirm new PIN', confirmPin, setConfirmPin, 'new-password')}

          <p className="text-xs text-ds-text-muted">Avoid repeated digits and simple sequences.</p>

          {error && (
            <p
              id="change-pin-error"
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
              {saving ? 'Updating…' : 'Update PIN'}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-ds-text-muted transition-colors hover:text-[#E7ECF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-ds-text-muted">
            Forgotten it? Sign out, then use &ldquo;Forgot your PIN?&rdquo; on the PIN step.
          </p>
        </form>
      )}
    </section>
  );
}
