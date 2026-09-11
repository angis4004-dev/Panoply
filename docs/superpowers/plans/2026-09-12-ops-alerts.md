# Operations Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email support@ when a user signs up, submits KYC, submits a deposit, or requests a withdrawal; rate-limit sign-ups per IP.

**Architecture:** `src/lib/ops-alerts.ts` holds pure renderers (event → subject + HTML via the shared `renderEmail`) and a fire-and-forget `alertOps` that sends through `sendEmail` and swallows every error. Each of the four routes calls `void alertOps(...)` after its write succeeds. The register route gains a per-IP limit that counts successful sign-ups only and is skipped when the IP is unknown.

**Tech Stack:** Next.js 16 route handlers, TypeScript, Resend via `src/lib/email.ts`, Vitest (`src/lib` only).

**Spec:** `docs/superpowers/specs/2026-09-12-ops-alerts-design.md`

## Global Constraints

- Recipient: `OPS_ALERT_EMAIL` if set, else `SUPPORT_EMAIL` from `src/lib/contact.ts`.
- Subjects begin `[Panoply] `.
- Never in an alert: ID number, date of birth, KYC document, full withdrawal destination, destination memo, password.
- Withdrawal destination shown as first 6 + `…` + last 6 characters.
- Admin base: `ADMIN_APP_URL`, else `https://${ADMIN_HOST}`, else no button (path as text).
- Alerts never delay, fail, or change a route's response.
- Sign-up limit: 3 successful sign-ups per IP per hour; checked before creation, counted after; skipped when `getClientIp` returns `'unknown'`.
- The dev server uses the production database: no test sign-ups, deposits or withdrawals.
- No `Co-Authored-By` trailer (project CLAUDE.md). Check real exit codes; `git status --short` before each commit; stage files by name.

---

### Task 1: Alert renderers and sender

**Files:**
- Create: `src/lib/ops-alerts.ts`
- Test: `src/lib/ops-alerts.test.ts`

**Interfaces:**
- Produces:
  - `type OpsEvent = SignupEvent | KycEvent | DepositEvent | WithdrawalEvent` (discriminated on `type`)
  - `interface SignupEvent { type: 'signup'; userId: string; name: string; email: string }`
  - `interface KycEvent { type: 'kyc'; userId: string; name: string; email: string; country: string; idType: string }`
  - `interface DepositEvent { type: 'deposit'; userId: string; email: string; amount: string; coin: string; network: string; txReference: string }`
  - `interface WithdrawalEvent { type: 'withdrawal'; userId: string; email: string; amountUsd: number; coin: string; network: string; destination: string }`
  - `function shortenAddress(address: string): string`
  - `function adminUrl(path: string, env?: NodeJS.ProcessEnv): string | null`
  - `function renderOpsAlert(event: OpsEvent, env?: NodeJS.ProcessEnv): { subject: string; html: string }`
  - `function alertOps(event: OpsEvent): Promise<void>` (never rejects)

- [ ] **Step 1: Write the failing tests** — `src/lib/ops-alerts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { adminUrl, renderOpsAlert, shortenAddress, type OpsEvent } from '@/lib/ops-alerts';

const env = { ADMIN_APP_URL: 'https://admin.panoply.finance/' } as NodeJS.ProcessEnv;

const signup: OpsEvent = { type: 'signup', userId: 'u1', name: 'Jane Doe', email: 'jane@example.com' };
const kyc: OpsEvent = {
  type: 'kyc',
  userId: 'u1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  country: 'Nigeria',
  idType: 'passport',
};
const deposit: OpsEvent = {
  type: 'deposit',
  userId: 'u1',
  email: 'jane@example.com',
  amount: '450',
  coin: 'USDT',
  network: 'TRC20',
  txReference: '0xabc123',
};
const withdrawal: OpsEvent = {
  type: 'withdrawal',
  userId: 'u1',
  email: 'jane@example.com',
  amountUsd: 300,
  coin: 'USDT',
  network: 'TRC20',
  destination: 'TXyz1234567890abcdefghijklmnopQRSTUV',
};

describe('subjects', () => {
  it('names each event and starts with [Panoply]', () => {
    expect(renderOpsAlert(signup, env).subject).toBe('[Panoply] New sign-up: Jane Doe');
    expect(renderOpsAlert(kyc, env).subject).toBe('[Panoply] KYC submitted: Jane Doe');
    expect(renderOpsAlert(deposit, env).subject).toBe(
      '[Panoply] Deposit submitted: 450 USDT (TRC20)'
    );
    expect(renderOpsAlert(withdrawal, env).subject).toBe(
      '[Panoply] Withdrawal requested: $300.00'
    );
  });

  it('strips line breaks a user could use to forge headers', () => {
    const s = renderOpsAlert({ ...signup, name: 'Jane\r\nBcc: x@y.z' }, env).subject;
    expect(s).not.toMatch(/[\r\n]/);
  });
});

describe('links', () => {
  it('points each alert at the admin page that handles it', () => {
    expect(renderOpsAlert(signup, env).html).toContain('https://admin.panoply.finance/admin/traders/u1');
    expect(renderOpsAlert(kyc, env).html).toContain('https://admin.panoply.finance/admin/kyc');
    expect(renderOpsAlert(deposit, env).html).toContain('https://admin.panoply.finance/admin/deposits');
    expect(renderOpsAlert(withdrawal, env).html).toContain(
      'https://admin.panoply.finance/admin/withdrawals'
    );
  });

  it('falls back to ADMIN_HOST, then to no link at all', () => {
    expect(adminUrl('/admin/kyc', { ADMIN_HOST: 'admin.panoply.finance' } as NodeJS.ProcessEnv)).toBe(
      'https://admin.panoply.finance/admin/kyc'
    );
    expect(adminUrl('/admin/kyc', {} as NodeJS.ProcessEnv)).toBeNull();
    const html = renderOpsAlert(kyc, {} as NodeJS.ProcessEnv).html;
    expect(html).toContain('/admin/kyc');
    expect(html).not.toContain('href="/admin');
  });
});

describe('what an alert may carry', () => {
  it('escapes user-typed text', () => {
    const html = renderOpsAlert({ ...signup, name: '<img src=x onerror=alert(1)>' }, env).html;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('never includes the full withdrawal destination', () => {
    const html = renderOpsAlert(withdrawal, env).html;
    expect(html).not.toContain(withdrawal.destination);
    expect(html).toContain('TXyz12…QRSTUV');
  });

  it('has no field for an ID number or date of birth to leak through', () => {
    // Structural: the KYC event type cannot carry them, so nothing can render them.
    const keys = Object.keys(kyc);
    expect(keys).not.toContain('idNumber');
    expect(keys).not.toContain('dateOfBirth');
  });
});

describe('shortenAddress', () => {
  it('keeps short addresses whole and shortens long ones', () => {
    expect(shortenAddress('abc')).toBe('abc');
    expect(shortenAddress('0123456789abcdefghij')).toBe('012345…efghij');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/ops-alerts.test.ts`
Expected: FAIL — cannot resolve `@/lib/ops-alerts`.

- [ ] **Step 3: Implement** — `src/lib/ops-alerts.ts`:

```ts
import { sendEmail } from '@/lib/email';
import { renderEmail } from '@/lib/email-template';
import { SUPPORT_EMAIL } from '@/lib/contact';

/**
 * Emails the team when something happens that a person has to act on.
 *
 * Four events: a sign-up, a KYC submission, a deposit claim and a withdrawal
 * request. The last three each create a pending item that sits in the admin
 * console until an operator deals with it, and until now nothing told anyone
 * it was there - the only way to find out was to go and look.
 *
 * Each alert carries enough to decide what to do and a button to the page
 * where it is done, and nothing more. Identity numbers, dates of birth and
 * documents never go into email; a withdrawal's destination is shortened.
 *
 * `alertOps` is fire-and-forget. Callers do not await it, and it never
 * throws: a mail outage must not turn a successful deposit into an error.
 */

export interface SignupEvent {
  type: 'signup';
  userId: string;
  name: string;
  email: string;
}

export interface KycEvent {
  type: 'kyc';
  userId: string;
  name: string;
  email: string;
  country: string;
  idType: string;
}

export interface DepositEvent {
  type: 'deposit';
  userId: string;
  email: string;
  amount: string;
  coin: string;
  network: string;
  txReference: string;
}

export interface WithdrawalEvent {
  type: 'withdrawal';
  userId: string;
  email: string;
  amountUsd: number;
  coin: string;
  network: string;
  destination: string;
}

export type OpsEvent = SignupEvent | KycEvent | DepositEvent | WithdrawalEvent;

/** First and last six characters: enough to recognise, not enough to reuse. */
export function shortenAddress(address: string): string {
  return address.length <= 14 ? address : `${address.slice(0, 6)}…${address.slice(-6)}`;
}

/** Absolute link into the admin console, or null when its host is unknown. */
export function adminUrl(path: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.ADMIN_APP_URL?.trim() || (env.ADMIN_HOST?.trim() ? `https://${env.ADMIN_HOST.trim()}` : '');
  if (!configured) return null;
  const base = /^https?:\/\//.test(configured) ? configured : `https://${configured}`;
  return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * Subjects are built from text users typed. A line break in a header is how
 * extra headers get injected, so they are flattened here even though the
 * mail API should refuse them - this is the layer that can be tested.
 */
function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

const usd = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function describeEvent(event: OpsEvent): {
  subject: string;
  title: string;
  lines: string[];
  path: string;
  action: string;
} {
  switch (event.type) {
    case 'signup':
      return {
        subject: `New sign-up: ${event.name}`,
        title: 'New sign-up',
        lines: [`**${event.name}** (${event.email}) just created an account.`],
        path: `/admin/traders/${encodeURIComponent(event.userId)}`,
        action: 'View trader',
      };
    case 'kyc':
      return {
        subject: `KYC submitted: ${event.name}`,
        title: 'Identity verification to review',
        lines: [
          `**${event.name}** (${event.email}) submitted identity verification.`,
          `Country: ${event.country}. Document type: ${event.idType}.`,
          'Their deposits stay locked until this is reviewed.',
        ],
        path: '/admin/kyc',
        action: 'Open the KYC queue',
      };
    case 'deposit':
      return {
        subject: `Deposit submitted: ${event.amount} ${event.coin} (${event.network})`,
        title: 'Deposit to match and approve',
        lines: [
          `**${event.email}** says they sent **${event.amount} ${event.coin}** on ${event.network}.`,
          `Transaction reference: ${event.txReference}`,
          'Their balance does not change until it is approved.',
        ],
        path: '/admin/deposits',
        action: 'Open deposits',
      };
    case 'withdrawal':
      return {
        subject: `Withdrawal requested: ${usd(event.amountUsd)}`,
        title: 'Withdrawal to review',
        lines: [
          `**${event.email}** requested **${usd(event.amountUsd)}** in ${event.coin} on ${event.network}.`,
          `Destination: ${shortenAddress(event.destination)}`,
        ],
        path: '/admin/withdrawals',
        action: 'Open withdrawals',
      };
  }
}

export function renderOpsAlert(
  event: OpsEvent,
  env: NodeJS.ProcessEnv = process.env
): { subject: string; html: string } {
  const d = describeEvent(event);
  const url = adminUrl(d.path, env);
  const html = renderEmail({
    eyebrow: 'Operations',
    title: d.title,
    preheader: oneLine(d.lines[0].replace(/\*\*/g, '')),
    paragraphs: url ? d.lines : [...d.lines, `Admin console page: ${d.path}`],
    action: url ? { label: d.action, url } : undefined,
    footnote: 'Sent to the operations inbox because this needs someone to act on it.',
  });
  return { subject: `[Panoply] ${oneLine(d.subject)}`, html };
}

export async function alertOps(event: OpsEvent): Promise<void> {
  try {
    const { subject, html } = renderOpsAlert(event);
    const sent = await sendEmail({
      to: process.env.OPS_ALERT_EMAIL?.trim() || SUPPORT_EMAIL,
      subject,
      html,
    });
    if (!sent) console.error(`Ops alert not delivered: ${subject}`);
  } catch (error) {
    console.error('Ops alert failed:', event.type, error);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/ops-alerts.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint --fix src/lib/ops-alerts.ts src/lib/ops-alerts.test.ts
npx eslint src/lib/ops-alerts.ts src/lib/ops-alerts.test.ts; echo "ESLINT_EXIT=$?"
git status --short
git add src/lib/ops-alerts.ts src/lib/ops-alerts.test.ts
git commit -m "Render and send operations alerts"
```

---

### Task 2: Hook the four routes

**Files:**
- Modify: `src/app/api/auth/register/route.ts` (after `registerUser` succeeds)
- Modify: `src/app/api/kyc/route.ts` (after `if (!updated) … 404`)
- Modify: `src/app/api/deposits/route.ts` (after `DepositModel.create`)
- Modify: `src/app/api/withdrawals/route.ts` (after `WithdrawalModel.create`)

**Interfaces:**
- Consumes: `alertOps`, `OpsEvent` (Task 1); `toDollars` from `src/lib/money.ts`.

- [ ] **Step 1: Register** — add `import { alertOps } from '@/lib/ops-alerts';` and, directly after `const result = await registerUser(body);`:

```ts
    void alertOps({
      type: 'signup',
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
    });
```

- [ ] **Step 2: KYC** — add the import and, directly after the `if (!updated) { … 404 … }` block:

```ts
  // Name, country and document type only. The ID number and date of birth
  // stay in the database; the queue link is how an operator reaches them.
  void alertOps({
    type: 'kyc',
    userId: session.user.id,
    name: updated.kycFullName || session.user.name,
    email: session.user.email,
    country: updated.kycCountry || '',
    idType: updated.kycIdType || '',
  });
```

- [ ] **Step 3: Deposit** — add the import and, directly after `const deposit = await DepositModel.create({ … });`:

```ts
    void alertOps({
      type: 'deposit',
      userId: session.user.id,
      email: session.user.email,
      amount: String(deposit.assetAmount),
      coin: deposit.coin,
      network: deposit.network,
      txReference: deposit.txReference,
    });
```

- [ ] **Step 4: Withdrawal** — add `import { alertOps } from '@/lib/ops-alerts';`, add `toDollars` to the existing `@/lib/money` import, and directly after `const row = await WithdrawalModel.create({ … });`:

```ts
    void alertOps({
      type: 'withdrawal',
      userId: session.user.id,
      email: session.user.email,
      amountUsd: toDollars(amountMinor),
      coin: payout.coin,
      network: network.name || payout.networkKey,
      destination: payout.address,
    });
```

(If `network` is not in scope at that point, use `payout.networkKey`; the type-check in Step 5 decides.)

- [ ] **Step 5: Type-check, lint, commit**

```bash
npx tsc --noEmit; echo "TSC_EXIT=$?"
npx eslint --fix src/app/api/auth/register/route.ts src/app/api/kyc/route.ts src/app/api/deposits/route.ts src/app/api/withdrawals/route.ts
npx eslint src/app/api/auth/register/route.ts src/app/api/kyc/route.ts src/app/api/deposits/route.ts src/app/api/withdrawals/route.ts; echo "ESLINT_EXIT=$?"
git status --short
git add src/app/api/auth/register/route.ts src/app/api/kyc/route.ts src/app/api/deposits/route.ts src/app/api/withdrawals/route.ts
git commit -m "Alert support@ on sign-ups, KYC, deposits and withdrawals"
```

---

### Task 3: Sign-up rate limit

**Files:**
- Modify: `src/lib/auth-rate-limits.ts` (constants + key)
- Modify: `src/lib/auth-rate-limits.test.ts`
- Modify: `src/app/api/auth/register/route.ts`

**Interfaces:**
- Produces: `SIGNUP_MAX_PER_IP = 3`, `SIGNUP_WINDOW_MS = 3_600_000`, `rateLimitKeys.signupIp(ip: string): string`.

- [ ] **Step 1: Failing test** — append to `src/lib/auth-rate-limits.test.ts`:

```ts
describe('sign-up limit', () => {
  it('has its own bucket and a budget of three an hour', async () => {
    const mod = await import('@/lib/auth-rate-limits');
    expect(mod.SIGNUP_MAX_PER_IP).toBe(3);
    expect(mod.SIGNUP_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(mod.rateLimitKeys.signupIp('198.51.100.7')).toBe('signup:ip:198.51.100.7');
    expect(mod.rateLimitKeys.signupIp('198.51.100.7')).not.toBe(
      mod.rateLimitKeys.forgotPasswordIp('198.51.100.7')
    );
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/auth-rate-limits.test.ts` — Expected: FAIL (`SIGNUP_MAX_PER_IP` undefined).

- [ ] **Step 3: Implement** — in `src/lib/auth-rate-limits.ts`, after `RECOVERY_REDEEM_WINDOW_MS`:

```ts
/**
 * Accounts one client may create per hour.
 *
 * Every sign-up sends a verification email and now an operations alert, so
 * an unthrottled sign-up endpoint is a way to spend the shared mail quota and
 * bury the support inbox. Three covers a household sharing a connection.
 * Counted on success only: a rejected form retried is not an account made.
 */
export const SIGNUP_MAX_PER_IP = 3;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
```

and in `rateLimitKeys` add:

```ts
  /** Accounts created from this client. */
  signupIp: (ip: string) => `signup:ip:${ip}`,
```

- [ ] **Step 4: Wire the route** — in `src/app/api/auth/register/route.ts` add imports:

```ts
import { checkLimit, consumeAttempt, getClientIp } from '@/lib/rate-limit';
import {
  SIGNUP_MAX_PER_IP,
  SIGNUP_WINDOW_MS,
  rateLimitKeys,
  tooManyRequests,
} from '@/lib/auth-rate-limits';
```

Directly after the `parseBody` guard (`if (invalid) return invalid;`):

```ts
    /*
     * Per client, checked now and counted only once an account exists.
     *
     * Skipped when the address is unknown. getClientIp returns the literal
     * 'unknown' without an x-forwarded-for header, and every visitor would
     * then share one bucket - three sign-ups an hour for the whole site.
     */
    const ip = getClientIp(request);
    const signupKey = ip === 'unknown' ? null : rateLimitKeys.signupIp(ip);
    if (!signupKey) {
      console.warn('Sign-up limit skipped: no client IP on the request.');
    } else {
      const limit = await checkLimit(signupKey, SIGNUP_MAX_PER_IP, SIGNUP_WINDOW_MS);
      if (limit.limited) {
        return tooManyRequests('Too many accounts created from this connection.', limit.retryAfterMs);
      }
    }
```

and directly after `const result = await registerUser(body);`:

```ts
    if (signupKey) await consumeAttempt(signupKey, SIGNUP_MAX_PER_IP, SIGNUP_WINDOW_MS);
```

- [ ] **Step 5: Run tests, type-check, lint, commit**

```bash
npx vitest run src/lib/auth-rate-limits.test.ts
npx tsc --noEmit; echo "TSC_EXIT=$?"
npx eslint --fix src/lib/auth-rate-limits.ts src/lib/auth-rate-limits.test.ts src/app/api/auth/register/route.ts
npx eslint src/lib/auth-rate-limits.ts src/lib/auth-rate-limits.test.ts src/app/api/auth/register/route.ts; echo "ESLINT_EXIT=$?"
git status --short
git add src/lib/auth-rate-limits.ts src/lib/auth-rate-limits.test.ts src/app/api/auth/register/route.ts
git commit -m "Limit sign-ups to three an hour per connection"
```

---

### Task 4: Verify

- [ ] **Step 1: Settle the IP question.** Read-only query of the `adminauditlogs` collection for the `ip` of the most recent entries. Real addresses mean production sends `x-forwarded-for` and the sign-up limit is active; `unknown` means it is skipped and the proxy needs configuring.
- [ ] **Step 2: Sign-up limit without creating accounts.** With the dev server up, pre-fill the `signup:ip:198.51.100.77` bucket with 3 hits via `consumeAttempt`, POST `/api/auth/register` with `x-forwarded-for: 198.51.100.77` and a valid-looking body, expect **429** with `Retry-After`, then delete the bucket. No account is created because the check precedes creation.
- [ ] **Step 3: Rendered preview** of all four alerts (scratchpad render via esbuild, served temporarily from `public/`, deleted after), checked at 375px.
- [ ] **Step 4: Full checks** — `npx vitest run`, `npx tsc --noEmit`, `npm run build` with the dev server stopped; real exit codes.
- [ ] **Step 5:** Update the spec status line to "Approved and implemented"; commit.
