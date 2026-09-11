'use client';

import Link from 'next/link';
import {
  ArrowDownToLine,
  Check,
  Clock,
  Fingerprint,
  Lock,
  ShieldCheck,
  UserRoundCheck,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import {
  activeStepKey,
  isJourneyComplete,
  type JourneyStep,
  type StepKey,
} from '@/lib/onboarding-journey';

/**
 * The new-trader journey, drawn.
 *
 * It used to stop at identity verification and then remove itself - at the
 * exact moment the user became allowed to deposit, which is the step people
 * most often cannot find. It now runs through the first deposit and the
 * first signal flow, and goes away only when the last of those is done.
 *
 * Presentational: the Overview computes the steps (src/lib/onboarding-journey)
 * so that this panel and the hero's button styling read the same answer.
 *
 * Carried over from the version before, deliberately:
 * - Account creation is listed, already ticked, so the panel reads as
 *   something underway rather than a list of demands.
 * - Only the first actionable step gets a solid button.
 * - There is no dismiss control. Every remaining step gates something real.
 */

const ICONS: Record<StepKey, LucideIcon> = {
  account: UserRoundCheck,
  pin: Fingerprint,
  kyc: ShieldCheck,
  deposit: ArrowDownToLine,
  flow: Waypoints,
};

/** Where each step's button goes. Deposit opens a window instead. */
const HREFS: Partial<Record<StepKey, string>> = {
  pin: '/dashboard/settings#pin',
  kyc: '/dashboard/kyc',
  flow: '/dashboard/bots',
};

const BUTTON_BASE =
  'inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised';
const BUTTON_SOLID = `${BUTTON_BASE} bg-primary text-primary-foreground hover:bg-primary/90`;
const BUTTON_OUTLINE = `${BUTTON_BASE} border border-primary/40 text-primary hover:bg-primary/10`;

function StepMarker({ step }: { step: JourneyStep }) {
  const Icon = ICONS[step.key];
  if (step.state === 'done') {
    return (
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  // Waiting and locked get their own marks so a glance tells "nothing to do
  // yet" apart from "your turn", without reading the sentence.
  const Mark = step.state === 'waiting' ? Clock : step.state === 'locked' ? Lock : Icon;
  return (
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ds-border text-ds-text-muted">
      <Mark className="h-4 w-4" aria-hidden />
    </span>
  );
}

export function OnboardingChecklist({
  steps,
  onDeposit,
}: {
  steps: JourneyStep[];
  onDeposit: () => void;
}) {
  if (isJourneyComplete(steps)) return null;

  const completed = steps.filter((s) => s.state === 'done').length;
  const activeKey = activeStepKey(steps);

  return (
    <section
      aria-labelledby="onboarding-heading"
      className="mb-6 rounded-xl border border-ds-border bg-ds-surface-raised/50 p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="onboarding-heading"
          className="font-display text-xl font-semibold tracking-[-0.02em] text-ds-text sm:text-2xl"
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
          const actionable = step.state === 'todo' || step.state === 'retry';
          const className = step.key === activeKey ? BUTTON_SOLID : BUTTON_OUTLINE;
          const href = HREFS[step.key];
          return (
            <li
              key={step.key}
              className={`flex flex-col gap-3 rounded-lg border border-ds-border/60 bg-ds-surface/40 p-3 sm:flex-row sm:items-center sm:justify-between ${
                step.state === 'locked' ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <StepMarker step={step} />
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      step.state === 'done' ? 'text-ds-text-muted line-through' : 'text-ds-text'
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-xs text-ds-text-muted">{step.body}</p>
                </div>
              </div>

              {actionable &&
                step.cta &&
                (step.key === 'deposit' ? (
                  <button type="button" onClick={onDeposit} className={className}>
                    {step.cta}
                  </button>
                ) : href ? (
                  <Link href={href} className={className}>
                    {step.cta}
                  </Link>
                ) : null)}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
