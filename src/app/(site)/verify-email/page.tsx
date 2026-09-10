'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, TriangleAlert } from 'lucide-react';
import { Loader } from '@/components/ui/loader';
import { PanoplyMark } from '@/components/ui/PanoplyLogo';

/**
 * The page an email verification link lands on.
 *
 * Two things were wrong with the version this replaces, and only one of them
 * was cosmetic.
 *
 * The failure state was a dead end. It said "Verification failed - this link
 * is invalid or has expired" and offered nothing: no sign-in link, no way to
 * request another email, not one anchor on the page. An expired link is the
 * *expected* case here, not an edge case - these tokens last 24 hours and mail
 * sits unread for longer than that all the time - so the most likely visitor
 * to this page was the one given nowhere to go.
 *
 * The other was that it hardcoded #0A0E13, #122131 and #8B95A5 rather than
 * using the design tokens every other page reads, so it drifted away from the
 * product the moment the palette moved.
 */

type Status = 'checking' | 'success' | 'error';

/**
 * Each failure gets its own heading and its own sentence.
 *
 * The alternative - one generic heading plus whatever the API said - printed
 * "This link has expired" directly above "This verification link is invalid or
 * has expired", which is the same sentence twice and reads as a template with
 * a variable in it. Three distinct things can go wrong here and they want
 * three different answers, because the useful next step differs in each.
 */
type ErrorKind = 'expired' | 'malformed' | 'offline';

const ERRORS: Record<ErrorKind, { title: string; body: string }> = {
  expired: {
    title: 'This link has expired',
    body: 'Verification links last 24 hours and work once. Sign in and we will send you a fresh one.',
  },
  malformed: {
    title: 'This link is incomplete',
    body: 'It is missing its verification code, which usually means it was copied by hand or broken across two lines. Open the link directly from your email instead.',
  },
  offline: {
    title: "We couldn't reach the server",
    body: 'Your link is probably fine. Check your connection and open it again.',
  },
};

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('checking');
  const [errorKind, setErrorKind] = useState<ErrorKind>('expired');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorKind('malformed');
      return;
    }

    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (res.ok) {
          setStatus('success');
        } else {
          setStatus('error');
          setErrorKind('expired');
        }
      })
      .catch(() => {
        setStatus('error');
        setErrorKind('offline');
      });
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ds-surface px-4 py-10 text-ds-text">
      <div className="w-full max-w-md">
        {/* The wordmark, above the card. Somebody arriving from an email needs
            to know whose site this is before they read anything else. */}
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <PanoplyMark size={30} className="text-brand-cream" />
          <span className="font-wordmark text-lg font-normal tracking-normal text-brand-cream">
            Panoply
          </span>
        </div>

        <div className="rounded-2xl border border-ds-border bg-ds-surface-raised/60 p-8">
          {status === 'checking' && (
            <div className="py-6 text-center" aria-live="polite">
              <Loader size={36} className="mx-auto mb-4 text-primary" />
              <p className="text-sm text-ds-text-muted">Confirming your email address…</p>
            </div>
          )}

          {status === 'success' && (
            <div aria-live="polite">
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-ds-value-positive/10">
                <CheckCircle2 className="h-6 w-6 text-ds-value-positive" aria-hidden="true" />
              </div>

              <h1 className="font-display text-2xl leading-tight text-ds-text">
                You&apos;re verified
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ds-text-secondary">
                Your email address is confirmed. Two things are worth doing before you deposit
                anything.
              </p>

              {/*
                The next two steps, named here rather than left to be discovered.
                This is the highest-intent moment in the whole flow - the person
                is on the page, having just acted - and the old version spent it
                on the words "Your email address has been confirmed."
              */}
              <ol className="mt-5 space-y-3">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ds-surface-inset text-[11px] font-semibold text-ds-text-secondary">
                    1
                  </span>
                  <span className="text-sm leading-relaxed text-ds-text-secondary">
                    <span className="font-medium text-ds-text">Set a sign-in PIN.</span> It is asked
                    for after your password, so a stolen password alone will not open your account.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ds-surface-inset text-[11px] font-semibold text-ds-text-secondary">
                    2
                  </span>
                  <span className="text-sm leading-relaxed text-ds-text-secondary">
                    <span className="font-medium text-ds-text">Verify your identity.</span> Deposits
                    and withdrawals stay locked until this is done.
                  </span>
                </li>
              </ol>

              <Link
                href="/dashboard"
                className="mt-7 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform duration-fast ease-ds-out active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
              >
                Go to your dashboard
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div aria-live="polite">
              {/*
                Amber, not red. An expired link is the ordinary outcome of
                leaving mail unread for a day - it is not an error the person
                made, and colouring it like a failure suggests something is
                wrong with their account when nothing is.
              */}
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-ds-value-warning/10">
                <TriangleAlert className="h-6 w-6 text-ds-value-warning" aria-hidden="true" />
              </div>

              <h1 className="font-display text-2xl leading-tight text-ds-text">
                {ERRORS[errorKind].title}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ds-text-secondary">
                {ERRORS[errorKind].body}
              </p>

              {/* The whole point of this rewrite: somewhere to go. */}
              <Link
                href="/sign-up-login-screen"
                className="mt-7 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform duration-fast ease-ds-out active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
              >
                Sign in
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>

              <p className="mt-4 text-center text-xs text-ds-text-muted">
                Still stuck? Sign in and use{' '}
                <span className="text-ds-text-secondary">Ask Panoply</span> to reach a person.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ds-surface">
          <Loader size={44} label="Loading" className="text-primary" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
