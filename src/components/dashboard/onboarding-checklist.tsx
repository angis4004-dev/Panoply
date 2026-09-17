'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
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
 * The new-trader journey, as a bar that opens.
 *
 * It runs from account creation through the first deposit and the first signal
 * flow, and goes away only when the last of those is done.
 *
 * Presentational: the Overview computes the steps (src/lib/onboarding-journey)
 * so that this panel and the hero's button styling read the same answer.
 *
 * Why a bar rather than the open panel it used to be: the dashboard showed
 * nothing at all until the account, deposits, flows and balance had every one
 * loaded, then inserted a ~300px list between the ticker and the wallet card,
 * pushing the page down under whoever was reading it. It now occupies one
 * consistent height from the first paint - placeholder, collapsed or complete
 * - and the steps are behind a disclosure.
 *
 * Carried over from the version before, deliberately:
 * - Account creation is listed, already ticked, so it reads as something
 *   underway rather than a list of demands.
 * - Only the first actionable step gets a solid button.
 * - There is no dismiss control while steps remain. Every one gates something
 *   real, and the collapsed bar is the way to get it out of the way.
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

/** Where the collapsed/expanded choice is remembered, per browser. */
const OPEN_STORAGE_KEY = 'panoply.setup.open';

/** One height for every state of this component, so nothing below it moves. */
const BAR_HEIGHT = 'min-h-[68px]';

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

/**
 * The room the bar takes before its data has arrived.
 *
 * Rendered by the Overview while the journey is still unknown, so the page is
 * laid out once rather than re-laid out when the last request lands.
 */
export function OnboardingChecklistPlaceholder() {
  return <div aria-hidden className={`mb-6 h-[68px] rounded-xl border border-ds-border/50`} />;
}

export function OnboardingChecklist({
  steps,
  onDeposit,
}: {
  steps: JourneyStep[];
  onDeposit: () => void;
}) {
  const complete = isJourneyComplete(steps);
  const completed = steps.filter((s) => s.state === 'done').length;
  const activeKey = activeStepKey(steps);
  const active = steps.find((step) => step.key === activeKey) ?? null;

  /*
   * Open for an account that has done nothing but exist; folded once the
   * trader is underway, when the list is reference rather than the thing they
   * came for. A stored choice wins over both.
   */
  const [open, setOpen] = useState(completed <= 1);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(OPEN_STORAGE_KEY);
      if (stored === 'open' || stored === 'closed') setOpen(stored === 'open');
    } catch {
      // A browser refusing storage is no reason to render nothing.
    }
  }, []);

  /*
   * On completion it says so for a moment and then removes itself, rather than
   * vanishing mid-glance and taking the rest of the page up with it.
   */
  useEffect(() => {
    if (!complete) return;
    const timer = window.setTimeout(() => setDismissed(true), 4000);
    return () => window.clearTimeout(timer);
  }, [complete]);

  if (complete && dismissed) return null;

  const toggle = () => {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      try {
        window.localStorage.setItem(OPEN_STORAGE_KEY, next ? 'open' : 'closed');
      } catch {
        // Ignored, as above.
      }
      return next;
    });
  };

  if (complete) {
    return (
      <section
        className={`mb-6 flex ${BAR_HEIGHT} items-center gap-3 rounded-xl border border-ds-border bg-ds-surface-raised/50 px-4`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-ds-text">Setup complete</p>
      </section>
    );
  }

  const actionable = active !== null && (active.state === 'todo' || active.state === 'retry');
  const activeHref = active ? HREFS[active.key] : undefined;

  return (
    <section aria-labelledby="onboarding-heading" className="mb-6">
      <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50">
        <div className={`flex ${BAR_HEIGHT} flex-wrap items-center gap-3 px-4 py-3`}>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls="onboarding-steps"
            className="flex min-h-[44px] flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-ds-text-muted transition-transform duration-base ease-ds-out ${
                open ? '' : '-rotate-90'
              }`}
              aria-hidden
            />
            <span className="min-w-0">
              <span id="onboarding-heading" className="block text-sm font-semibold text-ds-text">
                Setting up
              </span>
              {!open && active && (
                <span className="block truncate text-xs text-ds-text-muted">
                  Next: {active.title}
                </span>
              )}
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs text-ds-text-muted">
              {completed} of {steps.length}
            </span>
          </button>

          {/* The next action stays reachable while collapsed: folding the list
              away must not hide the thing it is asking for. */}
          {actionable &&
            active?.cta &&
            (active.key === 'deposit' ? (
              <button type="button" onClick={onDeposit} className={BUTTON_SOLID}>
                {active.cta}
              </button>
            ) : activeHref ? (
              <Link href={activeHref} className={BUTTON_SOLID}>
                {active.cta}
              </Link>
            ) : null)}
        </div>

        {/* Progress is stated in the count above as well as drawn here, so the
            bar is decorative to a screen reader rather than the only signal. */}
        <div className="mx-4 h-1 overflow-hidden rounded-full bg-ds-border" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-base ease-ds-out"
            style={{ width: `${(completed / steps.length) * 100}%` }}
          />
        </div>

        {open && (
          <ol id="onboarding-steps" className="space-y-3 p-4">
            {steps.map((step) => {
              const stepActionable = step.state === 'todo' || step.state === 'retry';
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

                  {stepActionable &&
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
        )}
      </div>
    </section>
  );
}
