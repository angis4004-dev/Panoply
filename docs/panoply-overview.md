# Panoply — what it is

> Quantitative intelligence for decentralized finance.

Panoply is a non-custodial DeFi automation platform. A trader configures
automated strategies, tracks a portfolio, discovers yield, and completes
identity verification; an internal operations team reviews those identities,
publishes deposit addresses, and confirms transfers on-chain.

This document describes the system **as it is actually built**, including the
parts that are simulated. It is written from the code, not from the marketing
copy. Read the "What is real, what is simulated" section before showing this
product to anyone who might put money into it.

---

## Two applications, one deployment

Panoply ships as a single Next.js app serving two entirely separate surfaces,
split by hostname:

| Surface | Host | Who uses it | Routes |
|---|---|---|---|
| **Trader application** | `app.example.com` | Customers | `/`, `/dashboard/**` |
| **Operations console** | `admin.example.com` | Internal staff | `/admin/**`, `/api/admin/**` |

`src/proxy.ts` enforces the split. On the trader host, `/admin` and
`/api/admin` do not 404-after-a-check — they simply **do not exist**, exactly
as if the console were a different deployment. From a trader's point of view,
it is.

This is routing and defence in depth, not the access control itself. The real
gate is `requireAdmin` in `src/lib/admin/guard.ts`, which every admin route
handler calls and which repeats the host check. Anything depending on a proxy
alone is one matcher edit away from being wrong.

The console is English-only and deliberately excluded from any localisation
work: it is staff-facing, so translating it would double the effort on a
surface no customer sees.

---

## What a trader can do

### Public pages
`/` landing, `/about`, `/security`, `/tiers`, `/charts`, `/signal-flows`, plus
`/terms`, `/privacy`, `/disclaimer`.

### Behind sign-in — `/dashboard`

| Page | Purpose |
|---|---|
| **Overview** | Wallet balance, signal-flow count, identity score, top yields |
| **Signal Flows** (`/bots`) | Create and manage automated strategies |
| **Portfolio Builder** (`/builder`) | Allocate across assets, risk analysis |
| **Vaults** | Investment products with APY and risk levels |
| **Yield** | Yield-opportunity discovery |
| **AI Center** (`/ai`) | Trading assistant |
| **Achievements** | Progress, milestones, trust score |
| **Verification** (`/kyc`) | Identity documents |
| **Report History** | Generated performance reports |
| **Settings** | Profile, sign-in PIN, wallet confirmation |

---

## How money actually moves

This is the part most worth understanding, because it is not what a casual
reader assumes.

1. An operator publishes a **platform-wide deposit address** per asset from
   the console. Addresses are not per-user.
2. A verified trader opens the deposit modal, sends funds to that address from
   their own wallet, and submits the **transaction hash**.
3. Because everyone deposits to the same pooled address, that hash is the only
   thing linking a transfer to an account.
4. Submitting **credits nothing**. It creates a pending claim.
5. An operator matches the transfer on-chain and approves it. Only then does
   the balance change.

The deposit modal states this plainly, because a trader who expects an instant
balance and does not get one files a support ticket — and the fix for that is
the sentence, not a spinner.

Deposit addresses, memo tags, ticker symbols and network names all carry
`translate="no"`. A browser translator rewriting a base58 address sends money
somewhere unrecoverable.

---

## Tiers and progression

Tier is derived from **lifetime deposited**, and gated behind KYC — an
unverified account has no tier at all, regardless of deposits.

| Tier | Lifetime deposited | Concurrent signal flows |
|---|---|---|
| Unverified | — | 0 |
| Novice | $0 | 1 |
| Amateur | $1,000 | 3 |
| Strategist | $10,000 | 6 |
| Vanguard | $50,000 | Unlimited |

An **Identity Score** (0–100) is computed server-side from verifiable state:
KYC verified (+30), wallet ownership confirmed (+15), email verified (+15),
wallet address assigned (+10), profile completed (+10), plus up to 10 from
achievement count.

---

## Security model

- **Password + PIN.** A six-digit PIN is required *after* the password, asked
  for at the dashboard door rather than at sign-in. Verified server-side at
  `/api/auth/pin/verify`.
- **The gate does not hide the dashboard, it withholds it.** `PinGate` renders
  children only once the PIN is accepted — not blurred, not overlaid. No
  dashboard component mounts, no effect runs, no balance is ever fetched. An
  overlay would still have loaded everything underneath it.
- **Host isolation** between trader and console, as above.
- **Admin responses** carry `no-store`, `frame-ancestors 'none'`, a strict CSP,
  and `X-Robots-Tag: noindex`. Every admin page is account data.
- **KYC documents** are encrypted at rest and served only through an
  authenticated admin route.
- **Audit log** (`AdminAuditLog`) records operator actions.

---

## Architecture

**Next.js 16** (App Router, Turbopack) · **React 19** · **MongoDB/Mongoose** ·
**NextAuth** · **Tailwind** · **Recharts** · **Three.js** · **GSAP** ·
**Resend** · **Zod**

```
src/
├── app/
│   ├── (site)/        trader application  — its own root layout
│   ├── (admin)/       operations console  — its own root layout
│   └── api/           ~55 route handlers
├── components/        shared UI, dashboard, admin-console, homepage
├── lib/
│   ├── models/        18 Mongoose schemas
│   ├── achievements/  catalog + scoring engine
│   └── admin/         host rules, permissions, guard
├── proxy.ts           host routing + auth redirects
└── styles/            design tokens
```

**Typography is role-based.** `--font-sans` and `--font-display` point at
whichever family fills that role, and Tailwind reads only the roles. Custom
properties cascade, so the dashboard runs Archivo while the marketing pages
keep Tahoma and Instrument Serif — without a single component changing.

**Language.** The site ships in English and relies on Chrome, Edge and Safari
to translate it. `<html lang="en">` is what triggers that offer. A nine-locale
system was built and then removed (commits `a615105` → `ae1aee9`) because it
routed without content: `/ja` served English prose under `lang="ja"`, which
tells a Japanese reader's browser the page is *already* in their language and
suppresses the one thing that would have helped. It is recoverable with
`git revert ae1aee9` if real translations are ever written.

---

## What is real, and what is simulated

**Read this before any demo to an investor or customer.**

### Real
Accounts, sessions, PIN, KYC submission and review, deposit claims and
operator approval, wallet balances, the ledger, tiers, achievements, and
**live market prices** (CoinGecko, cached 1 minute).

### Simulated
**Signal-flow profit and loss is a random walk.** Each running flow books a
small gain or loss every 30 seconds into `simulatedPnlPercent`, stored on the
bot and applied as catch-up on next read. It is biased by the flow's
confidence value. No order is placed against any market.

> `src/lib/bot-pnl.ts` — *"Persisted dry-run earnings simulation."*

### The gap you should close

`/terms` and `/disclaimer` both disclose the dry-run. The Terms go further:

> "Where this applies, it is disclosed in the product itself."

**It is not.** A search of the dashboard UI returns no user-visible dry-run
notice — only code comments. So the product currently contradicts its own
Terms, on the specific subject of whether displayed profits are real, on a
platform that accepts deposits. Restoring an on-dashboard disclosure is the
single highest-value change outstanding.

---

## Known gaps

| Gap | Detail |
|---|---|
| **Dry-run disclosure** | Missing from the dashboard; Terms claim it is present |
| **Achievement backfill** | Grants only fire at the moment of the action. Google sign-ups, admin-created traders, and anyone who acted before a grant line existed permanently have nothing. No reconciliation exists |
| **`welcome_to_aegis`** | Achievement key still carries the pre-Panoply brand. A stored DB key, so renaming needs a migration |
| **Number formatting** | Mixes bare `toLocaleString()` (follows the *viewer's* OS locale) with `toLocaleString('en-US')`. Two figures on one screen can disagree about their own decimal separator |
| **Seeded accounts** | Still on `@cryptotradeai.io`. Changing them breaks the demo login; needs a migration |
| **Rate limiting** | Password-reset and PIN-reset flows call no rate limiter |
| **Dead MFA hook** | `twoFactorEnabled` awards +10 identity score but nothing ever sets it |
| **Google Fonts at build** | Cold builds intermittently fail on font fetch timeouts. Self-hosting would remove a CI flake |

---

## Running it

```bash
npm install
npm run dev          # http://localhost:4028
```

```bash
npm run build && npm test
npm run type-check && npm run lint
```

Current state: **77 static pages**, types clean, lint 0 errors, **185 tests
passing**.

Copy `.env.example` to `.env`. Never commit `.env`.

### Deployment

Production currently deploys by **uploading the folder to Vercel**, which
bypasses git entirely — the repository and the live site can drift, and
uncommitted work reaches production. Connecting Vercel to
`github.com/angis4004-dev/panoply` would keep the two in step.
