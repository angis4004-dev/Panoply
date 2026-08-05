'use client';

import { useEffect, useRef, useState } from 'react';

const PIN_LENGTH = 6;

export interface PinStepResult {
  user: { id: string; email: string; name: string; role: 'Admin' | 'Trader'; kycStatus: string };
}

/**
 * Second step of sign-in: enter an existing PIN, or choose one if the account
 * has none yet.
 *
 * The password step no longer issues a session, so until this completes the
 * caller holds only a five-minute pending token that can do nothing else.
 */
export function PinStep({
  mode,
  pendingToken,
  userName,
  onComplete,
  onCancel,
}: {
  mode: 'verify' | 'setup';
  pendingToken: string;
  userName?: string;
  onComplete: (result: PinStepResult) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  // Digits only, capped at the PIN length. Filtering on input rather than
  // validating on submit means the field can never hold something the server
  // would reject, so the user is not told off for a character the form
  // accepted.
  const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (pin.length !== PIN_LENGTH) {
      setError(`Your PIN must be exactly ${PIN_LENGTH} digits.`);
      return;
    }
    if (mode === 'setup' && pin !== confirmPin) {
      setError('The two PINs do not match.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'setup' ? '/api/auth/pin/set' : '/api/auth/pin/verify';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'setup' ? { pendingToken, pin, confirmPin } : { pendingToken, pin }
        ),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || 'Unable to continue.');
        setPin('');
        setConfirmPin('');
        firstFieldRef.current?.focus();
        setLoading(false);
        return;
      }

      onComplete(payload as PinStepResult);
    } catch {
      setError('Unable to reach the authentication service.');
      setLoading(false);
    }
  };

  const heading = mode === 'setup' ? 'Choose a 6-digit PIN' : 'Enter your PIN';
  const blurb =
    mode === 'setup'
      ? 'You will enter this each time you sign in, after your password.'
      : userName
        ? `Welcome back, ${userName}. One more step.`
        : 'One more step to finish signing in.';

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#E7ECF2]">{heading}</h2>
        <p className="mt-1 text-sm text-[#8B95A5]">{blurb}</p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="w-full">
          <label htmlFor="pin" className="mb-2 block text-sm font-medium text-[#C5CCD6]">
            {mode === 'setup' ? 'New PIN' : 'PIN'}
          </label>
          {/* type="password" rather than the design's type="pin": the latter is
              not a valid input type, so browsers treat it as text and render
              the PIN in the clear. inputMode keeps the numeric keypad on
              mobile, and autoComplete is off so a PIN is never stored as a
              saved password. */}
          <input
            ref={firstFieldRef}
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_LENGTH}
            className="pin-input mx-auto block"
            placeholder="Enter your pin!"
            value={pin}
            onChange={(e) => setPin(onlyDigits(e.target.value))}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'pin-error' : 'pin-hint'}
            disabled={loading}
          />
        </div>

        {mode === 'setup' && (
          <div className="w-full">
            <label htmlFor="confirmPin" className="mb-2 block text-sm font-medium text-[#C5CCD6]">
              Confirm PIN
            </label>
            <input
              id="confirmPin"
              name="confirmPin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={PIN_LENGTH}
              className="pin-input mx-auto block"
              placeholder="Repeat your pin"
              value={confirmPin}
              onChange={(e) => setConfirmPin(onlyDigits(e.target.value))}
              disabled={loading}
            />
          </div>
        )}
      </div>

      <p id="pin-hint" className="text-center text-xs text-[#8B95A5]">
        {pin.length}/{PIN_LENGTH} digits
        {mode === 'setup' && ' — avoid repeated digits and simple sequences'}
      </p>

      {/* aria-live so the message is announced when it replaces a previous one,
          which a plain rendered paragraph would not be. */}
      {error && (
        <p
          id="pin-error"
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-[var(--ds-value-negative)]/40 bg-[var(--ds-value-negative)]/10 px-3 py-2 text-center text-sm text-[var(--ds-value-negative)]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || pin.length !== PIN_LENGTH}
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors duration-fast ease-ds-out hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Checking…' : mode === 'setup' ? 'Set PIN and continue' : 'Continue'}
      </button>

      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        className="w-full rounded text-center text-xs text-[#8B95A5] transition-colors duration-fast ease-ds-out hover:text-[#E7ECF2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        Back to sign in
      </button>
    </form>
  );
}
