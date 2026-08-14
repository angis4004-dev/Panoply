'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, ShieldCheck, TriangleAlert } from 'lucide-react';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';
import { Loader } from '@/components/ui/loader';
import { PinInput, PIN_LENGTH } from '@/components/auth/pin-input';
import { installUnlockToken } from '@/lib/dashboard-unlock-client';

/**
 * The door in front of the dashboard.
 *
 * Renders its children only once the PIN has been accepted. Not hidden, not
 * blurred, not overlaid - not rendered, so no dashboard component mounts, no
 * effect runs, and no request for a balance or a position is ever made. An
 * overlay on top of a live dashboard would still have fetched everything
 * underneath it, and a slow paint or a devtools inspection would show it.
 *
 * The unlock lives in memory for exactly one document. A refresh, a new tab
 * and a returning session all start locked again, because the token that
 * proves otherwise is a module variable and those three things each get a
 * fresh module.
 */

type Mode = 'checking' | 'enter' | 'create' | 'unlocked' | 'signed-out';

interface SessionResponse {
  user?: { name?: string; hasPin?: boolean } | null;
}

export function PinGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('checking');
  const [name, setName] = useState<string | null>(null);

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);

  const teardown = useRef<(() => void) | null>(null);

  // Ask the server who we are and whether a PIN exists. The client is never
  // the authority on either: a tampered local answer of "already unlocked"
  // buys nothing, because every data request still has to carry a token this
  // component can only get by presenting a correct PIN.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        if (cancelled) return;
        if (!response.ok) {
          setMode('signed-out');
          router.replace('/sign-up-login-screen');
          return;
        }
        const payload: SessionResponse = await response.json();
        setName(payload.user?.name ?? null);
        setMode(payload.user?.hasPin ? 'enter' : 'create');
      } catch {
        if (!cancelled) setError('Could not reach the server. Check your connection and retry.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Drops the token when the gate leaves the tree, so navigating away from the
  // dashboard entirely re-locks rather than leaving a live token in memory.
  useEffect(() => () => teardown.current?.(), []);

  const unlock = useCallback((token: string) => {
    teardown.current = installUnlockToken(token);
    setPin('');
    setConfirmPin('');
    setMode('unlocked');
  }, []);

  const verify = useCallback(
    async (candidate: string) => {
      if (candidate.length !== PIN_LENGTH || busy) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch('/api/auth/pin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: candidate }),
        });
        const payload = await response.json().catch(() => ({}));

        if (response.ok && payload.unlockToken) {
          unlock(payload.unlockToken);
          return;
        }

        // The account lost its PIN between the session check and now, or never
        // had one. Send them to the create flow rather than a dead end.
        if (payload.code === 'pin_not_set') {
          setMode('create');
          setPin('');
          return;
        }

        setLockedOut(response.status === 429);
        setError(payload.error ?? 'That PIN was not accepted.');
        setPin('');
      } catch {
        setError('Could not reach the server. Check your connection and retry.');
      } finally {
        setBusy(false);
      }
    },
    [busy, unlock]
  );

  const create = useCallback(async () => {
    if (pin.length !== PIN_LENGTH || confirmPin.length !== PIN_LENGTH || busy) return;
    if (pin !== confirmPin) {
      setError('The two PINs do not match.');
      setConfirmPin('');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/pin/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, confirmPin }),
      });
      const payload = await response.json().catch(() => ({}));

      if (response.ok && payload.unlockToken) {
        unlock(payload.unlockToken);
        return;
      }
      setError(payload.error ?? 'That PIN was not accepted.');
      setPin('');
      setConfirmPin('');
    } catch {
      setError('Could not reach the server. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  }, [pin, confirmPin, busy, unlock]);

  async function signOut() {
    teardown.current?.();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Signing out locally matters more than the round trip succeeding.
    }
    router.replace('/sign-up-login-screen');
  }

  async function requestReset() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/pin/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setNotice(
        response.ok
          ? 'If a PIN is set on this account, a reset link is on its way to your email.'
          : 'Could not send a reset link right now. Try again shortly.'
      );
    } catch {
      setNotice('Could not send a reset link right now. Try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'unlocked') return <>{children}</>;

  /*
   * Waiting states, and the one way out of them.
   *
   * `waiting` covers both cases where there is nothing to ask for yet: the
   * session is still being fetched, or we are on our way to sign-in. Those
   * show the loader and nothing else - no mark, no heading, no sign-out.
   *
   * `stuck` is the exception that has to exist. If the session request fails
   * the mode never advances, so a screen that renders only a spinner would
   * spin forever with no way off it. When that happens the door comes back:
   * the mark, the reason, and a sign-out button.
   */
  const waiting = mode === 'checking' || mode === 'signed-out';
  const stuck = waiting && Boolean(error);
  const settling = waiting && !stuck;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ds-surface px-4 py-10">
      {/* Same cream wash as the console sign-in, so the two doors of the
          product are visibly the same door. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/[0.07] blur-3xl"
      />

      <div className="relative w-full max-w-sm">
        {settling ? (
          /*
           * The waiting screen is the loader, alone.
           *
           * The mark used to render above it, so a slow session check showed a
           * finished-looking lockup with a spinner underneath - the shape of a
           * screen that has arrived, except it has not. One moving thing on an
           * empty surface reads as "wait" and nothing else, and it means the
           * lockup appears once, when the door is actually there.
           *
           * The sr-only line is the only text, and it is never painted: a live
           * region with no content announces nothing at all.
           */
          <div
            className="flex min-h-[20rem] items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <Loader size={48} className="text-primary" />
            <span className="sr-only">Checking your session</span>
          </div>
        ) : (
          <>
            {/*
             * Three strings, not six.
             *
             * This block used to carry an eyebrow, a heading, and a sentence
             * that restated the heading word for word - "Enter your PIN" above
             * "Enter your PIN to continue" - plus a second sentence explaining
             * what a PIN is to someone already using one. The heading is the
             * instruction; the only thing worth adding is which account is
             * locked, because that is the one fact the screen knows and the
             * reader might not.
             */}
            <div className="mb-7 flex flex-col items-center text-center">
              <PanoplyMark size={34} className="text-brand-cream" />

              {!stuck && (
                <h1 className="mt-4 text-ds-title text-ds-text">
                  {mode === 'create' ? 'Create a PIN' : 'Enter your PIN'}
                </h1>
              )}

              {mode === 'create' && (
                <p className="mt-1.5 max-w-xs text-ds-label font-normal leading-relaxed tracking-normal text-ds-text-muted">
                  Six digits. You&rsquo;ll enter it each time you open your dashboard.
                </p>
              )}
              {mode === 'enter' && name && (
                <p className="mt-1.5 text-ds-label font-normal tracking-normal text-ds-text-muted">
                  Signed in as {name}
                </p>
              )}
            </div>

            {/* The session request failed. Neither form will render, so this is
                the only thing that says why. */}
            {stuck && <Feedback error={error} notice={notice} busy={false} />}

            {mode === 'enter' && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void verify(pin);
                }}
                className="space-y-4"
              >
                <PinInput
                  label="Your six-digit PIN"
                  value={pin}
                  onChange={(next) => {
                    setPin(next);
                    if (error) setError(null);
                  }}
                  onComplete={(complete) => void verify(complete)}
                  disabled={busy || lockedOut}
                  invalid={Boolean(error)}
                  describedBy={error ? 'pin-gate-error' : undefined}
                />
                <Feedback error={error} notice={notice} busy={busy} />
                <button
                  type="submit"
                  disabled={busy || lockedOut || pin.length !== PIN_LENGTH}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast ease-ds-out hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
                >
                  {busy ? (
                    <Loader size={16} />
                  ) : (
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  {busy ? 'Checking…' : 'Unlock dashboard'}
                </button>

                <button
                  type="button"
                  onClick={() => void requestReset()}
                  disabled={busy}
                  className="w-full rounded text-ds-caption text-ds-text-muted underline-offset-2 transition-colors duration-fast ease-ds-out hover:text-ds-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
                >
                  Forgot your PIN?
                </button>
              </form>
            )}

            {mode === 'create' && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void create();
                }}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <span className="block text-center text-ds-caption uppercase tracking-wide text-ds-text-muted">
                    Choose a PIN
                  </span>
                  <PinInput
                    idPrefix="pin-new"
                    label="Choose a six-digit PIN"
                    value={pin}
                    onChange={(next) => {
                      setPin(next);
                      if (error) setError(null);
                    }}
                    disabled={busy}
                    invalid={Boolean(error)}
                  />
                </div>

                <div className="space-y-2">
                  <span className="block text-center text-ds-caption uppercase tracking-wide text-ds-text-muted">
                    Confirm it
                  </span>
                  <PinInput
                    idPrefix="pin-confirm"
                    label="Confirm your six-digit PIN"
                    value={confirmPin}
                    onChange={(next) => {
                      setConfirmPin(next);
                      if (error) setError(null);
                    }}
                    onComplete={() => void create()}
                    disabled={busy}
                    autoFocus={false}
                    invalid={Boolean(error)}
                  />
                </div>

                <Feedback error={error} notice={notice} busy={busy} />

                {/* No printed warning about 000000 and 123456. isWeakPin() in
                lib/pin.ts already refuses repeated digits, runs in either
                direction, and repeating pairs and triples, and every route
                answers with the reason - so the rule is enforced and explained
                at the moment it applies rather than as a paragraph read by
                nobody. */}
                <button
                  type="submit"
                  disabled={busy || pin.length !== PIN_LENGTH || confirmPin.length !== PIN_LENGTH}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-fast ease-ds-out hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
                >
                  {busy ? (
                    <Loader size={16} />
                  ) : (
                    <KeyRound className="h-4 w-4" aria-hidden="true" />
                  )}
                  {busy ? 'Saving…' : 'Set PIN'}
                </button>
              </form>
            )}

            {/* Reachable from every state that has a door in it. A gate with
                no way out is a gate that strands anyone who cannot remember
                the answer - which is why `stuck` exists above, so a failed
                session check lands here rather than on a spinner. */}
            <div className="mt-6 border-t border-ds-border pt-4">
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg text-ds-label font-medium tracking-normal text-ds-text-muted transition-colors duration-fast ease-ds-out hover:bg-ds-surface-inset hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * One live region for both outcomes, so a screen reader is told about a wrong
 * PIN or a sent reset link without the user having to go looking.
 */
function Feedback({
  error,
  notice,
  busy,
}: {
  error: string | null;
  notice: string | null;
  busy: boolean;
}) {
  return (
    <div aria-live="polite" role="status" className="min-h-[1.25rem]">
      {busy && <span className="sr-only">Working</span>}
      {error && (
        <p
          id="pin-gate-error"
          className="flex items-start justify-center gap-1.5 text-center text-ds-caption font-normal tracking-normal text-ds-value-negative"
        >
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="text-center text-ds-caption font-normal tracking-normal text-ds-text-muted">
          {notice}
        </p>
      )}
    </div>
  );
}
