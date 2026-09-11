# First-Deposit Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guide a new trader from identity verification through their first deposit to their first signal flow, and make depositing findable.

**Architecture:** A pure `deriveJourney` function in `src/lib/onboarding-journey.ts` decides every step's state from facts the dashboard already has. The Overview page gathers those facts (auth user, app store, a new `useDepositSummary` hook), computes the journey once, and hands it to a presentational checklist and to the hero's button styling, so the two can never disagree. The sidebar gains a Deposit link that opens the Overview's existing deposit window through a `?deposit=1` query parameter.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Tailwind with the `ds-*` tokens, lucide-react icons, Vitest (scoped to `src/lib`).

**Spec:** `docs/superpowers/specs/2026-09-11-first-deposit-journey-design.md`

## Global Constraints

- No time promise anywhere in the waiting copy.
- "Funds in play" = any approved deposit, or wallet balance > 0, or at least one signal flow. Step 4 is done and step 5 unlocks on this condition.
- Step 4 precedence, highest first: funds in play → done; identity not verified → locked; most recent deposit rejected → retry; any pending → waiting; else todo.
- Only the first `todo`/`retry` step gets the solid button; later actionable steps get the outlined button; `locked` and `waiting` get none. No dismiss control.
- The dev server uses the production database: never create deposits, users or signal flows to reach a state.
- Files stay under 500 lines (project rule). `src/app/(site)/dashboard/page.tsx` is already 540 and must end below 500.
- Commit messages have no `Co-Authored-By` trailer (project CLAUDE.md).
- Every command's real exit code is checked; never pipe a check into `tail` and read the pipe's status.

---

### Task 1: Journey logic

**Files:**
- Create: `src/lib/onboarding-journey.ts`
- Test: `src/lib/onboarding-journey.test.ts`

**Interfaces:**
- Produces:
  - `type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected'`
  - `type StepKey = 'account' | 'pin' | 'kyc' | 'deposit' | 'flow'`
  - `type StepState = 'done' | 'todo' | 'retry' | 'waiting' | 'locked'`
  - `interface JourneyStep { key: StepKey; state: StepState; title: string; body: string; cta: string | null }`
  - `interface DepositLike { status: 'pending' | 'approved' | 'rejected'; rejectionReason?: string | null; createdAt: string | Date }`
  - `interface DepositSummary { hasApproved: boolean; hasPending: boolean; latestRejected: boolean; rejectionReason: string | null }`
  - `const EMPTY_DEPOSIT_SUMMARY: DepositSummary`
  - `function summariseDeposits(deposits: DepositLike[]): DepositSummary`
  - `interface JourneyInput { hasPin: boolean; kycStatus: KycStatus; deposits: DepositSummary; walletBalance: number; botCount: number }`
  - `function deriveJourney(input: JourneyInput): JourneyStep[]` (always 5 steps, in order)
  - `function activeStepKey(steps: JourneyStep[]): StepKey | null`
  - `function isJourneyComplete(steps: JourneyStep[]): boolean`

- [ ] **Step 1: Write the failing tests** — create `src/lib/onboarding-journey.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  activeStepKey,
  deriveJourney,
  EMPTY_DEPOSIT_SUMMARY,
  isJourneyComplete,
  summariseDeposits,
  type JourneyInput,
  type StepKey,
} from '@/lib/onboarding-journey';

const base: JourneyInput = {
  hasPin: true,
  kycStatus: 'verified',
  deposits: EMPTY_DEPOSIT_SUMMARY,
  walletBalance: 0,
  botCount: 0,
};

const stateOf = (input: Partial<JourneyInput>, key: StepKey) =>
  deriveJourney({ ...base, ...input }).find((s) => s.key === key)!;

describe('summariseDeposits', () => {
  it('is empty for no deposits', () => {
    expect(summariseDeposits([])).toEqual(EMPTY_DEPOSIT_SUMMARY);
  });

  it('judges "latest" by createdAt, not by list order', () => {
    const summary = summariseDeposits([
      { status: 'rejected', rejectionReason: 'Old', createdAt: '2026-09-01T00:00:00Z' },
      { status: 'pending', createdAt: '2026-09-05T00:00:00Z' },
    ]);
    expect(summary.latestRejected).toBe(false);
    expect(summary.hasPending).toBe(true);
  });

  it('carries the reason of a rejected latest deposit', () => {
    const summary = summariseDeposits([
      { status: 'pending', createdAt: '2026-09-01T00:00:00Z' },
      { status: 'rejected', rejectionReason: 'Wrong network', createdAt: '2026-09-05T00:00:00Z' },
    ]);
    expect(summary).toMatchObject({ latestRejected: true, rejectionReason: 'Wrong network' });
  });

  it('records any approved deposit', () => {
    expect(
      summariseDeposits([{ status: 'approved', createdAt: '2026-09-01T00:00:00Z' }]).hasApproved
    ).toBe(true);
  });
});

describe('deriveJourney', () => {
  it('always returns the five steps in order', () => {
    expect(deriveJourney(base).map((s) => s.key)).toEqual([
      'account',
      'pin',
      'kyc',
      'deposit',
      'flow',
    ]);
  });

  it('marks the account step done unconditionally', () => {
    expect(stateOf({ hasPin: false, kycStatus: 'unverified' }, 'account').state).toBe('done');
  });

  it('maps the pin step', () => {
    expect(stateOf({ hasPin: false }, 'pin').state).toBe('todo');
    expect(stateOf({ hasPin: true }, 'pin').state).toBe('done');
  });

  it('maps every identity status', () => {
    expect(stateOf({ kycStatus: 'unverified' }, 'kyc').state).toBe('todo');
    expect(stateOf({ kycStatus: 'pending' }, 'kyc')).toMatchObject({ state: 'waiting', cta: null });
    expect(stateOf({ kycStatus: 'rejected' }, 'kyc')).toMatchObject({
      state: 'retry',
      cta: 'Try again',
    });
    expect(stateOf({ kycStatus: 'verified' }, 'kyc').state).toBe('done');
  });

  describe('deposit step', () => {
    it('is locked until identity is verified', () => {
      const step = stateOf({ kycStatus: 'pending' }, 'deposit');
      expect(step).toMatchObject({ state: 'locked', cta: null });
      expect(step.body).toBe('Unlocks once your identity is verified.');
    });

    it('is todo for a verified user with nothing sent', () => {
      expect(stateOf({}, 'deposit')).toMatchObject({ state: 'todo', cta: 'Deposit' });
    });

    it('waits on a pending deposit without promising a time', () => {
      const step = stateOf({ deposits: { ...EMPTY_DEPOSIT_SUMMARY, hasPending: true } }, 'deposit');
      expect(step).toMatchObject({ state: 'waiting', cta: null });
      expect(step.body).not.toMatch(/hour|minute|day|soon/i);
    });

    it('offers a retry with the operator reason when the latest was rejected', () => {
      const step = stateOf(
        {
          deposits: {
            ...EMPTY_DEPOSIT_SUMMARY,
            hasPending: true,
            latestRejected: true,
            rejectionReason: 'Sent on the wrong network',
          },
        },
        'deposit'
      );
      expect(step).toMatchObject({ state: 'retry', cta: 'Try again' });
      expect(step.body).toContain('Sent on the wrong network');
    });

    it('still explains a rejection that came without a reason', () => {
      const step = stateOf(
        { deposits: { ...EMPTY_DEPOSIT_SUMMARY, latestRejected: true, rejectionReason: null } },
        'deposit'
      );
      expect(step.state).toBe('retry');
      expect(step.body.length).toBeGreaterThan(20);
    });

    it('is done once a deposit is approved, even if a later one was rejected', () => {
      expect(
        stateOf(
          { deposits: { ...EMPTY_DEPOSIT_SUMMARY, hasApproved: true, latestRejected: true } },
          'deposit'
        ).state
      ).toBe('done');
    });

    it('is done for a user credited by an operator, with no deposit at all', () => {
      expect(stateOf({ walletBalance: 250 }, 'deposit').state).toBe('done');
      expect(stateOf({ botCount: 1 }, 'deposit').state).toBe('done');
    });
  });

  describe('signal flow step', () => {
    it('is locked until funds are in play', () => {
      const step = stateOf({}, 'flow');
      expect(step).toMatchObject({ state: 'locked', cta: null });
      expect(step.body).toBe('Unlocks once your first deposit is approved.');
    });

    it('is locked while the only deposit is still pending', () => {
      expect(
        stateOf({ deposits: { ...EMPTY_DEPOSIT_SUMMARY, hasPending: true } }, 'flow').state
      ).toBe('locked');
    });

    it('is todo once there is a balance', () => {
      expect(stateOf({ walletBalance: 500 }, 'flow')).toMatchObject({
        state: 'todo',
        cta: 'Create signal flow',
      });
    });

    it('is done once a signal flow exists', () => {
      expect(stateOf({ botCount: 1 }, 'flow').state).toBe('done');
    });
  });
});

describe('activeStepKey', () => {
  it('picks the first todo or retry step', () => {
    expect(activeStepKey(deriveJourney({ ...base, hasPin: false, kycStatus: 'unverified' }))).toBe(
      'pin'
    );
    expect(activeStepKey(deriveJourney(base))).toBe('deposit');
  });

  it('skips steps that are only waiting', () => {
    expect(activeStepKey(deriveJourney({ ...base, kycStatus: 'pending' }))).toBeNull();
  });
});

describe('isJourneyComplete', () => {
  it('is true only when every step is done', () => {
    expect(isJourneyComplete(deriveJourney({ ...base, walletBalance: 10, botCount: 1 }))).toBe(
      true
    );
    expect(isJourneyComplete(deriveJourney({ ...base, walletBalance: 10 }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/onboarding-journey.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/onboarding-journey"`.

- [ ] **Step 3: Implement** — create `src/lib/onboarding-journey.ts`:

```ts
/**
 * The path a new trader takes from sign-up to their first signal flow.
 *
 * A pure function of facts the dashboard already holds, so the checklist and
 * the Overview's button styling read one answer rather than each deciding for
 * themselves what "ready to deposit" means. See
 * docs/superpowers/specs/2026-09-11-first-deposit-journey-design.md.
 *
 * The journey has two waits built into it - identity review and deposit
 * approval - that can each run for days. Every state here is written to be
 * true while the user is away, because that is when most of them are read.
 */

export type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type StepKey = 'account' | 'pin' | 'kyc' | 'deposit' | 'flow';
export type StepState = 'done' | 'todo' | 'retry' | 'waiting' | 'locked';

export interface JourneyStep {
  key: StepKey;
  state: StepState;
  title: string;
  body: string;
  /** Button label, or null when there is nothing for the user to do. */
  cta: string | null;
}

/** The fields of a deposit this module reads. /api/deposits returns more. */
export interface DepositLike {
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  createdAt: string | Date;
}

export interface DepositSummary {
  hasApproved: boolean;
  hasPending: boolean;
  /** The most recent deposit, by createdAt, was rejected. */
  latestRejected: boolean;
  /** The operator's reason for that rejection, when they gave one. */
  rejectionReason: string | null;
}

export const EMPTY_DEPOSIT_SUMMARY: DepositSummary = {
  hasApproved: false,
  hasPending: false,
  latestRejected: false,
  rejectionReason: null,
};

/**
 * Sorted here rather than trusting the API's order. The route happens to sort
 * newest first today; "the latest was rejected" should not silently change
 * meaning if that ever stops being true.
 */
export function summariseDeposits(deposits: DepositLike[]): DepositSummary {
  if (deposits.length === 0) return EMPTY_DEPOSIT_SUMMARY;
  const latest = [...deposits].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  const latestRejected = latest.status === 'rejected';
  return {
    hasApproved: deposits.some((d) => d.status === 'approved'),
    hasPending: deposits.some((d) => d.status === 'pending'),
    latestRejected,
    rejectionReason: latestRejected ? latest.rejectionReason?.trim() || null : null,
  };
}

export interface JourneyInput {
  hasPin: boolean;
  kycStatus: KycStatus;
  deposits: DepositSummary;
  walletBalance: number;
  botCount: number;
}

/**
 * Money the user can already put to work.
 *
 * Not just "a deposit was approved": operators can credit a balance directly
 * (src/lib/admin-balance.ts). A user funded that way has never deposited, and
 * a rule keyed on deposits alone would ask them to forever and never let the
 * checklist close.
 */
function hasFundsInPlay({ deposits, walletBalance, botCount }: JourneyInput): boolean {
  return deposits.hasApproved || walletBalance > 0 || botCount > 0;
}

function kycStep(status: KycStatus): JourneyStep {
  const title = 'Verify your identity';
  switch (status) {
    case 'verified':
      return { key: 'kyc', state: 'done', title, body: 'Done.', cta: null };
    case 'pending':
      return {
        key: 'kyc',
        state: 'waiting',
        title,
        body: 'Submitted. We are reviewing your documents and will update you here.',
        cta: null,
      };
    case 'rejected':
      return {
        key: 'kyc',
        state: 'retry',
        title,
        body: 'Your last submission could not be verified. Check the details and try again.',
        cta: 'Try again',
      };
    default:
      return {
        key: 'kyc',
        state: 'todo',
        title,
        body: 'Required before you can deposit funds or allocate capital to a signal flow.',
        cta: 'Verify identity',
      };
  }
}

function depositStep(input: JourneyInput): JourneyStep {
  const title = 'Make your first deposit';
  const { deposits } = input;

  if (hasFundsInPlay(input)) {
    return { key: 'deposit', state: 'done', title, body: 'Your account is funded.', cta: null };
  }
  if (input.kycStatus !== 'verified') {
    return {
      key: 'deposit',
      state: 'locked',
      title,
      body: 'Unlocks once your identity is verified.',
      cta: null,
    };
  }
  if (deposits.latestRejected) {
    return {
      key: 'deposit',
      state: 'retry',
      title,
      body: deposits.rejectionReason
        ? `Your last deposit could not be matched: ${deposits.rejectionReason}`
        : 'Your last deposit could not be matched. Check the network and the transaction reference, then try again.',
      cta: 'Try again',
    };
  }
  if (deposits.hasPending) {
    return {
      key: 'deposit',
      state: 'waiting',
      title,
      body: 'Sent. We match it on-chain, and your balance updates once it is approved.',
      cta: null,
    };
  }
  return {
    key: 'deposit',
    state: 'todo',
    title,
    body: 'Send crypto from your own wallet to your Panoply address. It is how every account is funded.',
    cta: 'Deposit',
  };
}

function flowStep(input: JourneyInput): JourneyStep {
  const title = 'Create your first signal flow';
  if (input.botCount > 0) {
    return { key: 'flow', state: 'done', title, body: 'Your first flow is running.', cta: null };
  }
  // Identity is checked as well as funds because the server refuses a flow to
  // an unverified account whatever its balance (TIER_SLOT_LIMITS.unverified).
  if (!hasFundsInPlay(input) || input.kycStatus !== 'verified') {
    return {
      key: 'flow',
      state: 'locked',
      title,
      body: 'Unlocks once your first deposit is approved.',
      cta: null,
    };
  }
  return {
    key: 'flow',
    state: 'todo',
    title,
    body: 'Choose a pair and a strategy, and allocate part of your balance to it.',
    cta: 'Create signal flow',
  };
}

export function deriveJourney(input: JourneyInput): JourneyStep[] {
  return [
    {
      key: 'account',
      state: 'done',
      title: 'Create your account',
      body: 'Done. Welcome to Panoply.',
      cta: null,
    },
    input.hasPin
      ? { key: 'pin', state: 'done', title: 'Set a sign-in PIN', body: 'Done.', cta: null }
      : {
          key: 'pin',
          state: 'todo',
          title: 'Set a sign-in PIN',
          body: 'A 6-digit PIN asked for after your password, so a stolen password is not enough on its own.',
          cta: 'Set a PIN',
        },
    kycStep(input.kycStatus),
    depositStep(input),
    flowStep(input),
  ];
}

/** The one step that gets the solid button. Waiting steps are not actionable. */
export function activeStepKey(steps: JourneyStep[]): StepKey | null {
  return steps.find((s) => s.state === 'todo' || s.state === 'retry')?.key ?? null;
}

export function isJourneyComplete(steps: JourneyStep[]): boolean {
  return steps.every((s) => s.state === 'done');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/onboarding-journey.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint --fix src/lib/onboarding-journey.ts src/lib/onboarding-journey.test.ts
npx eslint src/lib/onboarding-journey.ts src/lib/onboarding-journey.test.ts; echo "ESLINT_EXIT=$?"
git add src/lib/onboarding-journey.ts src/lib/onboarding-journey.test.ts
git commit -m "Derive the new-trader journey from what the dashboard knows"
```

---

### Task 2: Deposit summary hook and presentational checklist

**Files:**
- Create: `src/hooks/use-deposit-summary.ts`
- Modify: `src/components/dashboard/onboarding-checklist.tsx` (full rewrite; currently 161 lines)

**Interfaces:**
- Consumes: `summariseDeposits`, `EMPTY_DEPOSIT_SUMMARY`, `DepositSummary`, `DepositLike`, `JourneyStep`, `activeStepKey`, `isJourneyComplete` from Task 1.
- Produces:
  - `function useDepositSummary(enabled: boolean, refreshKey: number): { summary: DepositSummary; loaded: boolean }`
  - `function OnboardingChecklist(props: { steps: JourneyStep[]; onDeposit: () => void }): JSX.Element | null`

- [ ] **Step 1: Create the hook** — `src/hooks/use-deposit-summary.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import {
  EMPTY_DEPOSIT_SUMMARY,
  summariseDeposits,
  type DepositLike,
  type DepositSummary,
} from '@/lib/onboarding-journey';

/**
 * The trader's deposit history, reduced to what the journey needs.
 *
 * Only fetched once `enabled` - an unverified account cannot have deposits,
 * so asking would be a request for an answer already known. `refreshKey`
 * refetches, which the Overview bumps when the deposit window closes so a
 * just-submitted deposit shows as waiting straight away.
 *
 * A failed request resolves to the empty summary rather than an error. The
 * journey then shows "Deposit" as the next step, which is never wrong enough
 * to block anyone, and the deposit window shows the real history when opened.
 *
 * The previous answer stays in place while a refresh is in flight, so the
 * checklist does not blank out and reappear every time the window closes.
 */
export function useDepositSummary(
  enabled: boolean,
  refreshKey: number
): { summary: DepositSummary; loaded: boolean } {
  const [summary, setSummary] = useState<DepositSummary | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/deposits')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: unknown) => {
        if (cancelled) return;
        setSummary(summariseDeposits(Array.isArray(list) ? (list as DepositLike[]) : []));
      })
      .catch(() => {
        if (!cancelled) setSummary(EMPTY_DEPOSIT_SUMMARY);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  if (!enabled) return { summary: EMPTY_DEPOSIT_SUMMARY, loaded: true };
  return { summary: summary ?? EMPTY_DEPOSIT_SUMMARY, loaded: summary !== null };
}
```

- [ ] **Step 2: Rewrite the checklist** — replace the whole of `src/components/dashboard/onboarding-checklist.tsx`:

```tsx
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
```

- [ ] **Step 3: Type-check** (the Overview still uses the old zero-prop signature, so this is expected to fail in exactly one place until Task 3)

Run: `npx tsc --noEmit; echo "TSC_EXIT=$?"`
Expected: one error in `src/app/(site)/dashboard/page.tsx` about `OnboardingChecklist` missing `steps`/`onDeposit`, and nothing else. Do **not** commit yet; Task 3 completes the change.

---

### Task 3: Wire the Overview — hero extraction, journey, button swap, `?deposit=1`

**Files:**
- Create: `src/components/dashboard/portfolio-hero.tsx`
- Create: `src/components/dashboard/deposit-query-opener.tsx`
- Modify: `src/app/(site)/dashboard/page.tsx` (imports at lines 3–18; the checklist at line 158; the hero `<section>` at lines 160–228; the modal at line 230)

**Interfaces:**
- Consumes: `useDepositSummary` (Task 2), `OnboardingChecklist` (Task 2), `deriveJourney`, `KycStatus` (Task 1).
- Produces:
  - `function PortfolioHero(props: { promoteDeposit: boolean; onDeposit: () => void }): JSX.Element`
  - `function DepositQueryOpener(props: { ready: boolean; onOpen: () => void }): null`

- [ ] **Step 1: Create the hero** — `src/components/dashboard/portfolio-hero.tsx`. This is the hero `<section>` moved out of the page verbatim, with the Deposit and Create Signal Flow buttons' classes chosen by `promoteDeposit`:

```tsx
'use client';

import Link from 'next/link';
import { ArrowUpRight, Waypoints } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

const BUTTON_BASE =
  'inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface';
const SOLID = `${BUTTON_BASE} bg-primary font-semibold text-primary-foreground hover:bg-primary/90`;
const OUTLINE = `${BUTTON_BASE} border border-ds-border font-medium text-ds-text hover:border-primary/40 hover:bg-ds-surface-inset`;

/**
 * Wallet balance and the three things you can do from it.
 *
 * Moved out of the Overview page, which had grown past the project's 500-line
 * limit, when the buttons gained a second arrangement.
 *
 * `promoteDeposit` swaps which button is solid. A verified trader with nothing
 * in their balance cannot create a signal flow - there is nothing to allocate
 * - so the solid button used to point at the one action that would fail. The
 * Overview decides this from the same journey the checklist reads, so the two
 * never recommend different next steps.
 */
export function PortfolioHero({
  promoteDeposit,
  onDeposit,
}: {
  promoteDeposit: boolean;
  onDeposit: () => void;
}) {
  const {
    bots,
    botsLoading,
    walletBalance,
    walletBalanceLoading,
    walletBalanceError,
    fetchWalletBalance,
  } = useAppStore();

  return (
    <section className="mb-6 rounded-xl border border-ds-border bg-ds-surface-raised/60 p-5 sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ds-text-muted">
            Wallet Balance
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-4xl font-bold tabular-nums text-ds-text sm:text-5xl">
              {walletBalanceLoading
                ? 'Loading'
                : walletBalanceError
                  ? 'Unavailable'
                  : `$${walletBalance.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
            </span>
          </div>
          {walletBalanceError ? (
            <button
              type="button"
              onClick={fetchWalletBalance}
              className="mt-2 text-left text-sm font-semibold text-primary underline underline-offset-2"
            >
              Wallet unavailable. Retry
            </button>
          ) : (
            <p className="mt-2 text-sm text-ds-text-muted">
              {botsLoading
                ? 'Loading signal flows'
                : `${bots.length} signal flow${bots.length === 1 ? '' : 's'}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onDeposit} className={promoteDeposit ? SOLID : OUTLINE}>
            Deposit
          </button>
          <Link href="/dashboard/bots" className={promoteDeposit ? OUTLINE : SOLID}>
            <Waypoints className="h-4 w-4" />
            Create Signal Flow
          </Link>
          <Link href="/dashboard/builder" className={OUTLINE}>
            Run Builder
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create the query opener** — `src/components/dashboard/deposit-query-opener.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Opens the deposit window when the Overview is reached as /dashboard?deposit=1,
 * which is where the sidebar's Deposit entry points.
 *
 * Its own component so `useSearchParams` can sit inside a Suspense boundary:
 * reading search params in the page itself would opt the whole Overview out of
 * static rendering. It waits for `ready` (the session is known) because the
 * opener checks verification, and then strips the parameter so a refresh does
 * not reopen the window.
 */
export function DepositQueryOpener({ ready, onOpen }: { ready: boolean; onOpen: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const wantsDeposit = params.get('deposit') === '1';

  useEffect(() => {
    if (!ready || !wantsDeposit) return;
    onOpen();
    router.replace('/dashboard', { scroll: false });
  }, [ready, wantsDeposit, onOpen, router]);

  return null;
}
```

- [ ] **Step 3: Update the page imports** — in `src/app/(site)/dashboard/page.tsx` replace lines 3–11:

```tsx
import { Suspense, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowUpRight, Vault } from 'lucide-react';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import MetricsBentoGrid from '@/app/(site)/dashboard/components/MetricsBentoGrid';
import { PageHeader } from '@/components/dashboard/page-header';
import { MarketTicker } from '@/components/dashboard/market-ticker';
import { DepositModal } from '@/components/dashboard/deposit-modal';
import { PortfolioHero } from '@/components/dashboard/portfolio-hero';
import { DepositQueryOpener } from '@/components/dashboard/deposit-query-opener';
import { useDepositSummary } from '@/hooks/use-deposit-summary';
import { deriveJourney } from '@/lib/onboarding-journey';
```

(`Waypoints` moves to the hero. Keep `ArrowUpRight`/`Vault` only if still used elsewhere in the page — lint in Step 7 reports any that are not.)

- [ ] **Step 4: Compute the journey** — immediately after the existing `const [depositOpen, setDepositOpen] = useState(false);` line, add:

```tsx
  const [depositRefresh, setDepositRefresh] = useState(0);
  const deposits = useDepositSummary(isVerified, depositRefresh);

  /*
   * One answer for the checklist and the hero's button styling.
   *
   * Held back until everything it reads has loaded: the store starts at a
   * $0 balance and no flows before its first fetch lands, and computing from
   * those defaults would flash "make your first deposit" at a funded trader.
   */
  const journeyReady =
    !!user && deposits.loaded && !botsLoading && !walletBalanceLoading;
  const journey = journeyReady
    ? deriveJourney({
        hasPin: user.hasPin === true,
        kycStatus: user.kycStatus ?? 'unverified',
        deposits: deposits.summary,
        walletBalance,
        botCount: bots.length,
      })
    : null;
  const depositState = journey?.find((step) => step.key === 'deposit')?.state;
  const promoteDeposit = depositState === 'todo' || depositState === 'retry';

  // The one way into the deposit window, shared by the hero, the checklist and
  // the sidebar link. Verification is checked here as well as by the API so an
  // unverified trader gets a sentence rather than a window that cannot load.
  const openDeposit = useCallback(() => {
    if (!isVerified) {
      addToast('Complete identity verification before depositing funds.', 'info');
      return;
    }
    setDepositOpen(true);
  }, [isVerified, addToast]);
```

- [ ] **Step 5: Replace the checklist, hero and modal render** — replace the block from `{/* Setting a PIN and verifying identity used to be two separate banners` (line ~155) through `{depositOpen && <DepositModal onClose={() => setDepositOpen(false)} />}` (line ~230) with:

```tsx
      <Suspense fallback={null}>
        <DepositQueryOpener ready={!!user} onOpen={openDeposit} />
      </Suspense>

      {/* The ordered setup checklist, now running through the first deposit
          and the first signal flow. It removes itself once both are done. */}
      {journey && <OnboardingChecklist steps={journey} onDeposit={openDeposit} />}

      <PortfolioHero promoteDeposit={promoteDeposit} onDeposit={openDeposit} />

      {depositOpen && (
        <DepositModal
          onClose={() => {
            setDepositOpen(false);
            // Refetch so a deposit submitted in the window shows as waiting.
            setDepositRefresh((n) => n + 1);
          }}
        />
      )}
```

- [ ] **Step 6: Drop now-unused store fields** — in the `useAppStore()` destructure at the top of `DashboardPage`, remove `walletBalanceError` and `fetchWalletBalance` **only if** Step 7's lint reports them unused. `bots`, `botsLoading`, `walletBalance`, `walletBalanceLoading` and `addToast` are used by Step 4.

- [ ] **Step 7: Type-check, lint, and check the page length**

```bash
npx tsc --noEmit; echo "TSC_EXIT=$?"
npx eslint --fix "src/app/(site)/dashboard/page.tsx" src/components/dashboard/portfolio-hero.tsx src/components/dashboard/deposit-query-opener.tsx src/components/dashboard/onboarding-checklist.tsx src/hooks/use-deposit-summary.ts
npx eslint "src/app/(site)/dashboard/page.tsx" src/components/dashboard/portfolio-hero.tsx src/components/dashboard/deposit-query-opener.tsx src/components/dashboard/onboarding-checklist.tsx src/hooks/use-deposit-summary.ts; echo "ESLINT_EXIT=$?"
wc -l "src/app/(site)/dashboard/page.tsx"
```

Expected: `TSC_EXIT=0`, `ESLINT_EXIT=0`, page under 500 lines. Remove any unused imports lint names, and re-run.

- [ ] **Step 8: Commit Tasks 2 and 3 together** (Task 2 alone does not compile)

```bash
git add src/hooks/use-deposit-summary.ts src/components/dashboard/onboarding-checklist.tsx src/components/dashboard/portfolio-hero.tsx src/components/dashboard/deposit-query-opener.tsx "src/app/(site)/dashboard/page.tsx"
git commit -m "Carry the setup checklist through the first deposit and first signal flow"
```

---

### Task 4: Sidebar Deposit entry

**Files:**
- Modify: `src/components/dashboard/sidebar.tsx:5-18` (icon import), `:65-77` (`navItems`)

**Interfaces:**
- Consumes: `/dashboard?deposit=1` handled by `DepositQueryOpener` (Task 3).

- [ ] **Step 1: Add the icon import** — in the lucide import list, add `ArrowDownToLine,` before `ArrowUpFromLine,`.

- [ ] **Step 2: Add the entry** — in `navItems`, directly above the Withdraw line, add:

```tsx
  // A link to the Overview with the deposit window open, not a page of its
  // own: the window already exists there, and one home for the flow is one
  // thing to keep right. The query string never matches `pathname`, so this
  // entry never shows as active - Overview does, which is where the user is.
  { href: '/dashboard?deposit=1', label: 'Deposit', icon: ArrowDownToLine },
```

- [ ] **Step 3: Lint and commit**

```bash
npx eslint src/components/dashboard/sidebar.tsx; echo "ESLINT_EXIT=$?"
git add src/components/dashboard/sidebar.tsx
git commit -m "Put Deposit in the sidebar, next to Withdraw"
```

---

### Task 5: First-time steps in the deposit window

**Files:**
- Create: `src/components/dashboard/deposit-first-time-steps.tsx`
- Modify: `src/components/dashboard/deposit-modal.tsx` (state near line 68; the fetch effect near line 133; the body at line ~227, just inside `<div className="relative space-y-5">`)

**Interfaces:**
- Consumes: `summariseDeposits` (Task 1).
- Produces: `function DepositFirstTimeSteps(): JSX.Element`

- [ ] **Step 1: Create the strip** — `src/components/dashboard/deposit-first-time-steps.tsx`:

```tsx
/**
 * How depositing works, shown until the trader's first deposit is approved.
 *
 * A deposit is the one step in the journey that leaves the site halfway
 * through: copy an address, go to another app, send, come back, paste a
 * reference. Every mistake that loses money happens in the gap. Three
 * numbered lines, read before the address is copied, are cheaper than a
 * support ticket about a transfer on the wrong network.
 *
 * Returning traders do not see it - they have done this before, and a
 * permanent explainer is one people learn to scroll past.
 */
const STEPS = [
  'Copy your Panoply address below.',
  'Send from your own wallet, on the same network shown here.',
  'Come back and paste the transaction reference.',
];

export function DepositFirstTimeSteps() {
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ds-text">
        How depositing works
      </p>
      <ol className="mt-3 space-y-2">
        {STEPS.map((text, i) => (
          <li key={text} className="flex gap-3 text-sm text-ds-text-secondary">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {i + 1}
            </span>
            {text}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ds-text-muted">
        Your balance updates once we match the transfer on-chain and approve it.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Track whether the history has loaded** — in `deposit-modal.tsx`, after `const [deposits, setDeposits] = useState<TraderDeposit[]>([]);` add:

```tsx
  const [depositsLoaded, setDepositsLoaded] = useState(false);
```

and replace

```tsx
      if (depositRes.status === 'fulfilled' && depositRes.value.ok) {
        setDeposits(await depositRes.value.json());
      }
```

with

```tsx
      if (depositRes.status === 'fulfilled' && depositRes.value.ok) {
        setDeposits(await depositRes.value.json());
      }
      // Set on failure too: an unknown history is treated as a first deposit,
      // and showing the steps to someone who has deposited before costs them
      // three lines, where hiding them from a first-timer can cost a transfer.
      setDepositsLoaded(true);
```

- [ ] **Step 3: Render it** — add the imports:

```tsx
import { summariseDeposits } from '@/lib/onboarding-journey';
import { DepositFirstTimeSteps } from '@/components/dashboard/deposit-first-time-steps';
```

and, as the first child of `<div className="relative space-y-5">`, add:

```tsx
          {depositsLoaded &&
            !summariseDeposits(deposits).hasApproved &&
            addresses !== null &&
            addresses.length > 0 && <DepositFirstTimeSteps />}
```

(Hidden when no address is published: explaining how to deposit next to "deposits are not open yet" contradicts the sentence below it.)

- [ ] **Step 4: Type-check, lint, length, commit**

```bash
npx tsc --noEmit; echo "TSC_EXIT=$?"
npx eslint --fix src/components/dashboard/deposit-modal.tsx src/components/dashboard/deposit-first-time-steps.tsx
npx eslint src/components/dashboard/deposit-modal.tsx src/components/dashboard/deposit-first-time-steps.tsx; echo "ESLINT_EXIT=$?"
wc -l src/components/dashboard/deposit-modal.tsx
git add src/components/dashboard/deposit-modal.tsx src/components/dashboard/deposit-first-time-steps.tsx
git commit -m "Explain depositing inside the window, until the first one lands"
```

Expected: exit codes 0; modal under 500 lines.

---

### Task 6: Verify end to end, then sync the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-first-deposit-journey-design.md` (Architecture table rows for the checklist and the page)

- [ ] **Step 1: Full checks** (with the dev server stopped — the machine has 8 GB and a concurrent build has run it out of memory)

```bash
npx vitest run; echo "VITEST_EXIT=$?"
npx tsc --noEmit; echo "TSC_EXIT=$?"
npm run build > build.log 2>&1; echo "BUILD_EXIT=$?"; grep -Ei "error|Compiled successfully" build.log | head
```

Expected: all 0. Delete `build.log` afterwards.

- [ ] **Step 2: Browser check** on the dev server (`preview_start` with name `panoply`), signed in as a real account. Do not create deposits, users or flows.
  - Overview: checklist shows five steps in the state the account is actually in; `N of 5 complete` matches.
  - Sidebar shows *Deposit* above *Withdraw*; clicking it opens the deposit window (verified account) or shows the verification toast (unverified), and the URL returns to `/dashboard`.
  - For a verified account with a $0 balance and no flows: *Deposit* is the solid hero button.
  - Deposit window: the "How depositing works" strip shows for an account with no approved deposit, and not for one with.
  - Phone width (375px): checklist rows stack, buttons stay ≥ 44px tall, nothing overflows.
  - `read_console_messages` with `onlyErrors: true` is empty.

- [ ] **Step 3: Sync the spec** — the checklist became presentational and the page owns the data. In the spec's Architecture table, replace the `onboarding-checklist.tsx` row's responsibility with: *"Renders the steps it is given. Presentational; takes `steps` and `onDeposit`."* and the `page.tsx` row's with: *"Owns `depositOpen`; fetches the deposit summary via `useDepositSummary`; computes the journey once for the checklist and the hero; bumps a refresh key when the deposit window closes."* Add rows for `src/hooks/use-deposit-summary.ts`, `portfolio-hero.tsx`, `deposit-query-opener.tsx` and `deposit-first-time-steps.tsx`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-11-first-deposit-journey-design.md
git commit -m "Bring the journey spec in line with where the data ended up"
```
