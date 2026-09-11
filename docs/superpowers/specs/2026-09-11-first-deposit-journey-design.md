# First-deposit journey — design

**Date:** 2026-09-11
**Status:** Approved and implemented

## Problem

A new trader has no guided path from sign-up to actually using Panoply.

- **Deposit is hard to find.** The sidebar has *Withdraw* but no *Deposit*. The
  only way in is an outlined secondary button on the Overview hero, beside a
  solid *Create Signal Flow* button that a user with a $0 balance cannot use.
- **The guide stops too early.** `OnboardingChecklist` covers Account → PIN →
  identity verification, then removes itself — at exactly the moment the user
  becomes allowed to deposit.
- **Depositing is a five-part job that leaves the site halfway through:** pick
  coin and network → copy the platform address (and memo, where the network
  uses one) → send from an external wallet → return and submit the transaction
  reference → wait for an operator to approve. The deposit window explains this
  well, but only to someone who has already found and opened it.

## Constraints from the existing rules

- Deposits require `kycStatus === 'verified'` (enforced in `/api/deposits`).
- Verified → Novice tier → 1 signal-flow slot (`TIER_SLOT_LIMITS`). Unverified → 0.
- Creating a signal flow debits its allocation from the wallet balance
  atomically, so a deposit must be **approved** (credited), not merely
  submitted, before a flow can be funded.
- The journey therefore contains two waits that can each take days: identity
  review and deposit approval. Any guide has to survive the user leaving and
  coming back.

## Decision

Extend the existing checklist into the full journey (approach A). Rejected:
a spotlight tour (runs on day one, before the user can deposit; easily
skipped; hard on mobile where the sidebar is a drawer) and a standalone guide
page (reading rather than doing).

## Design

### 1. The journey — five steps

The panel title stays **Finish setting up**; progress reads *N of 5 complete*.

| # | Step | States |
|---|------|--------|
| 1 | Create your account | Always done. |
| 2 | Set a sign-in PIN | todo → done. Unchanged. |
| 3 | Verify your identity | todo → **waiting** ("Under review", no button) → **retry** (rejected; "Try again") → done. Unchanged wording. |
| 4 | Make your first deposit | **locked** until step 3 is done ("Unlocks once your identity is verified.") → **todo** (button opens the deposit window) → **waiting** (a pending deposit exists and none is approved: "Sent. We match it on-chain, and your balance updates once it is approved.") → **retry** (the most recent deposit was rejected and none is approved: shows the operator's reason; "Try again") → **done** (funds in play — see below). |
| 5 | Create your first signal flow | **locked** until step 4 is done ("Unlocks once your first deposit is approved.") → **todo** (button → `/dashboard/bots`) → **done** (at least one signal flow exists). |

Rules carried over from the current checklist:

- Only the first actionable step (`todo` or `retry`) gets the solid button;
  later actionable steps get the outlined button; `locked` and `waiting`
  steps get none.
- No dismiss control. The panel removes itself when all five steps are done.
- No time promise anywhere in the waiting copy.

Precedence for step 4, highest first: funds already in play → done; else most
recent deposit rejected → retry; else any pending → waiting; else todo.
"Most recent" is by `createdAt`.

"Funds in play" means any approved deposit, **or** a wallet balance above 0,
**or** at least one signal flow. The last two matter because operators can
adjust balances directly (`src/lib/admin-balance.ts`): a user credited that
way has money but no approved deposit, and a rule keyed on deposits alone
would ask them to deposit forever and never let the panel close. Step 5
unlocks on the same condition.

### 2. Findability

- **Sidebar:** new *Deposit* entry, placed directly above *Withdraw*, linking
  to `/dashboard?deposit=1`.
- **Overview:** on load, `?deposit=1` opens the deposit window if the user is
  verified; otherwise it shows the existing toast ("Complete identity
  verification before depositing funds."). The query parameter is removed from
  the URL once handled, so a refresh does not reopen the window.
- **Button swap on the Overview hero:** when the user is verified, the wallet
  balance is 0, and they have no signal flows, *Deposit* renders as the solid
  primary button and *Create Signal Flow* as the outlined one. In every other
  state the current styling stands.
- **Checklist step 4** opens the same window via a callback, not a navigation.

A dedicated deposit page was considered and rejected: the modal already works,
and two homes for the same flow means two things to keep in step.

### 3. The deposit window, first time only

While the user has no approved deposit, the window shows a three-step strip
above the coin picker:

> **1** Copy your Panoply address → **2** Send from your wallet on the same
> network → **3** Paste the transaction reference here.
> Your balance updates once we match the transfer on-chain and approve it.

Existing network and memo warnings stay where they are. The strip disappears
after the first approved deposit. The window already fetches `/api/deposits`,
so this needs no new request.

### 4. Architecture

| Unit | Responsibility |
|------|----------------|
| `src/lib/onboarding-journey.ts` (new) | Pure function `deriveJourney(input) → JourneyStep[]` plus `isJourneyComplete`. Input: `hasPin`, `kycStatus`, a deposit summary (`hasApproved`, `hasPending`, `latestRejectedReason`), `walletBalance`, `botCount`. No React, no I/O. |
| `src/lib/onboarding-journey.test.ts` (new) | Every state of every step, and the step-4 precedence rules. |
| `src/components/dashboard/onboarding-checklist.tsx` | Renders the steps it is given. Presentational; takes `steps` and `onDeposit`. |
| `src/hooks/use-deposit-summary.ts` (new) | Fetches `/api/deposits` once identity is verified; returns `{ summary, loaded }`; refetches on a refresh key. |
| `src/app/(site)/dashboard/page.tsx` | Owns `depositOpen`; fetches the deposit summary via `useDepositSummary`; computes the journey once for the checklist and the hero; bumps a refresh key when the deposit window closes. |
| `src/components/dashboard/portfolio-hero.tsx` (new) | Wallet balance and the three hero buttons, with `promoteDeposit` choosing which is solid. Moved out of the page, which was over the 500-line limit. |
| `src/components/dashboard/identity-tier-card.tsx` (new) | The identity & tier card, moved out of the page unchanged for the same reason. |
| `src/components/dashboard/deposit-query-opener.tsx` (new) | Opens the deposit window on `?deposit=1`, inside a Suspense boundary so the Overview stays statically rendered. |
| `src/components/dashboard/sidebar.tsx` | One new nav entry. |
| `src/components/dashboard/deposit-first-time-steps.tsx` (new) | The first-time strip, rendered by `deposit-modal.tsx`. |

A helper `summariseDeposits(deposits)` in the journey module turns the
`/api/deposits` list into the summary above, so the checklist and the modal
agree on what "first deposit done" means.

### 5. Loading and errors

- The panel renders nothing until the session is known (existing rule) and,
  for a verified user, until the deposits response arrives — so a user who has
  finished never sees a flash of an unfinished checklist.
- If `/api/deposits` fails, step 4 is treated as `todo`: the guide never blocks
  anyone, and the deposit window shows the real history when opened.
- Signal-flow count comes from the store the Overview already loads; while it
  is loading, step 5 is treated as not done.

### 6. Testing

- Unit tests on `deriveJourney` and `summariseDeposits`, including a user
  with a balance or a signal flow but no approved deposit.
- Browser check on the dev server of the states reachable with real accounts.
  The dev server uses the production database, so no fake deposits are created
  to reach the *waiting* and *retry* states; those are covered by the unit
  tests.
- `npm test`, type-check, lint and build before committing.

## Out of scope

- A spotlight tour or standalone guide page.
- Email nudges for users who stall mid-journey.
- Changing deposit approval, KYC review, or tier rules.
