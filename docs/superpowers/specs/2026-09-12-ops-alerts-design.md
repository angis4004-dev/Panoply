# Operations alerts to support@ — design

**Date:** 2026-09-12
**Status:** Approved in conversation, pending spec review

## Problem

Four things users do need a person at Panoply to act, and nothing tells
anyone they happened. Each only shows up if someone opens the right admin
console page:

| Event | Where it happens | What waits on a person |
|---|---|---|
| New sign-up | `POST /api/auth/register` | Nothing blocks, but the team wants to know who is arriving. |
| KYC submitted | `POST /api/kyc` (status → `pending`) | Review in `/admin/kyc`; deposits are locked until it passes. |
| Deposit submitted | `POST /api/deposits` (status → `pending`) | Matching on-chain and approval in `/admin/deposits`; the balance does not move until then. |
| Withdrawal requested | `POST /api/withdrawals` (status → `pending`) | Approval in `/admin/withdrawals`. |

## Decision

One email per event, sent the moment it succeeds (approach A). Rejected for
now: a daily digest (needs a scheduler the host makes awkward without shell
access, and lets a deposit wait a day unseen) and console-only badges (the
request was email).

## Design

### Recipient and sender

- To `OPS_ALERT_EMAIL` if set, else `SUPPORT_EMAIL` (`support@panoply.finance`,
  `src/lib/contact.ts`).
- Through the existing `sendEmail` (Resend, logo attachment, Reply-To) and
  `renderEmail` template, so alerts look like the rest of the product's mail.
- Subjects start with `[Panoply]` for filtering:
  - `[Panoply] New sign-up: <name>`
  - `[Panoply] KYC submitted: <name>`
  - `[Panoply] Deposit submitted: <amount> <coin> (<network>)`
  - `[Panoply] Withdrawal requested: <amount USD>`

### Content — enough to act on, nothing more

| Event | Included | Never included |
|---|---|---|
| Sign-up | name, email, time | password, anything else |
| KYC | name, email, country, ID type | ID number, date of birth, document |
| Deposit | user email, amount, coin, network, transaction reference | — |
| Withdrawal | user email, amount (USD), coin, network, destination shortened to first 6 and last 6 characters | full destination address, memo |

Each email has one button to the admin console page that handles it:
`/admin/traders/<id>` for sign-ups, `/admin/kyc`, `/admin/deposits`,
`/admin/withdrawals`. The console base is `ADMIN_APP_URL`, else
`https://<ADMIN_HOST>`; if neither is set the button is omitted and the page
path is written as text. On the admin host these paths are served as-is, and
an operator who is not signed in is sent to `/admin/login?next=<path>` and
back.

### Delivery never affects the user

Alerts are fire-and-forget: the route starts the send and returns its
response without waiting. `alertOps` catches every error and logs it; a
Resend outage or a missing API key can never delay, fail or change the
response of a sign-up, KYC submission, deposit or withdrawal.

### Sign-up rate limit

Alerts make an unthrottled sign-up endpoint worse: a bot creating accounts
would now also flood `support@` and spend the shared Resend quota (every
sign-up already sends a verification email). `POST /api/auth/register` gets a
per-IP limit of **3 successful sign-ups per hour**, using the existing
`checkLimit`/`consumeAttempt`/`tooManyRequests` helpers and a new key in
`src/lib/auth-rate-limits.ts`. Checked before the account is created,
counted only after one is: a person retrying a rejected form (weak
password, typo) must not use up the budget, and what the limit exists to
stop is accounts being made.

**Skipped when the client IP is unknown.** `getClientIp` returns the
literal `'unknown'` when the proxy sends no `x-forwarded-for`, and every
visitor then shares one bucket - "3 per IP" would become "3 per hour for the
whole site". Whether production sends that header is still unconfirmed, so
the limit applies only to a real address, and logs once when it cannot.

### Units

| Unit | Responsibility |
|---|---|
| `src/lib/ops-alerts.ts` (new) | Pure renderers per event (`renderOpsAlert(event) → { subject, html }`) plus `alertOps(event)`, which renders, sends and swallows errors. |
| `src/lib/ops-alerts.test.ts` (new) | Escaping of user-typed text; forbidden fields never appear; destination shortening; admin link with and without a configured host. |
| The four routes | One `void alertOps({...})` line each, after the action succeeds. |
| `src/lib/auth-rate-limits.ts` | New `signupIp` key and budget constants. |

## Testing

- Unit tests above.
- Rendered preview of each alert, checked at phone width.
- The sign-up limit checked against the dev server without creating any
  account: the rate-limit bucket for a test IP is pre-filled, a sign-up from
  that IP must get 429, and the bucket is then deleted. The dev server uses the
  production database, so no test sign-ups are made.
- The admin audit log's recorded `ip` values are read to settle whether
  production sends `x-forwarded-for`.

## Out of scope

- Digest emails, console badges, alerts for any other event.
- Alerting on sign-ins.
