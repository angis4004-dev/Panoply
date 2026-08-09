'use client';

import Link from 'next/link';
import { Check, Fingerprint, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

/**
 * Ordered setup checklist for a new account.
 *
 * Replaces two separate, unordered nags: a "no sign-in PIN" banner and an
 * inline "complete identity verification" line, which could both be on screen
 * at once with nothing saying which to do first or how much was left. This
 * states the whole sequence and marks progress through it.
 *
 * Three deliberate choices:
 *
 * - Account creation is listed, already ticked. It costs a row and turns the
 *   panel from a list of demands into something already underway.
 * - Only the first outstanding step gets a solid button. Later steps stay
 *   visible but subdued, so the path is legible without asking for three
 *   things at once.
 * - There is no dismiss control. Both remaining steps gate real capability -
 *   the PIN is the account's second factor, and KYC gates every deposit -
 *   so the panel goes away by being completed, not by being hidden.
 */
export function OnboardingChecklist() {
  const { user } = useAuth();

  // `user` is undefined on the first render while the session request is in
  // flight. Rendering then would flash a full checklist at someone who has
  // already finished it, so nothing is shown until the answer arrives.
  if (!user) return null;

  const hasPin = user.hasPin === true;
  const kycStatus = user.kycStatus ?? 'unverified';
  const kycDone = kycStatus === 'verified';
  // Submitted and awaiting review is not "done", but it is not actionable
  // either - there is nothing for the user to do but wait.
  const kycPending = kycStatus === 'pending';

  if (hasPin && kycDone) return null;

  const steps = [
    {
      key: 'account',
      icon: UserRoundCheck,
      title: 'Create your account',
      body: 'Done — welcome to Aegis.',
      done: true,
      href: null,
      cta: null,
    },
    {
      key: 'pin',
      icon: Fingerprint,
      title: 'Set a sign-in PIN',
      body: 'A 6-digit PIN asked for after your password, so a stolen password is not enough on its own.',
      done: hasPin,
      href: '/dashboard/settings#pin',
      cta: 'Set a PIN',
    },
    {
      key: 'kyc',
      icon: ShieldCheck,
      title: 'Verify your identity',
      body: kycPending
        ? 'Submitted. We are reviewing your documents and will update you here.'
        : kycStatus === 'rejected'
          ? 'Your last submission could not be verified. Check the details and try again.'
          : 'Required before you can deposit funds or allocate capital to a signal flow.',
      done: kycDone,
      href: kycPending ? null : '/dashboard/kyc',
      cta: kycStatus === 'rejected' ? 'Try again' : 'Verify identity',
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  // The one step that gets the solid button: first outstanding, and not one
  // that is merely waiting on us.
  const activeKey = steps.find((s) => !s.done && s.href)?.key;

  return (
    <section
      aria-labelledby="onboarding-heading"
      className="mb-6 rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="onboarding-heading"
          className="font-display text-xl font-semibold tracking-[-0.02em] text-white sm:text-2xl"
        >
          Finish setting up
        </h2>
        <span className="font-mono text-xs text-ds-text-muted">
          {completed} of {steps.length} complete
        </span>
      </div>

      {/* Progress is stated in the text above as well as drawn here, so the bar
          is decorative to a screen reader rather than the only signal. */}
      <div className="mb-5 h-1 w-full overflow-hidden rounded-full bg-ds-border" aria-hidden>
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-base ease-ds-out"
          style={{ width: `${(completed / steps.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-3">
        {steps.map((step) => {
          const Icon = step.icon;
          const isActive = step.key === activeKey;
          return (
            <li
              key={step.key}
              className="flex flex-col gap-3 rounded-lg border border-ds-border/60 bg-ds-surface/40 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    step.done
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-ds-border text-ds-text-muted'
                  }`}
                >
                  {step.done ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      step.done ? 'text-ds-text-muted line-through' : 'text-[#E7ECF2]'
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-xs text-ds-text-muted">{step.body}</p>
                </div>
              </div>

              {!step.done && step.href && (
                <Link
                  href={step.href}
                  className={`inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised ${
                    isActive
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border border-primary/40 text-primary hover:bg-primary/10'
                  }`}
                >
                  {step.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
