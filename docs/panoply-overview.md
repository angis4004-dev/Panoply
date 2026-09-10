# Panoply — what it is

> Quantitative intelligence for decentralized finance.

Panoply is a non-custodial DeFi automation platform. A trader configures
automated strategies, tracks a portfolio, discovers yield, and completes
identity verification; an internal operations team reviews those identities,
publishes deposit addresses, and confirms transfers on-chain.

This document describes the system architecture, features, and platform workflows.

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
| **Yield** | Live third-party pool rates from DefiLlama, with risk bands |
| **Ask Panoply** (`/ai`) | In-app assistant and support |
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

## Getting help

**Ask Panoply** is the in-app assistant, reachable two ways: the "Ask Panoply"
entry in the dashboard sidebar, and the floating button on every other
dashboard page — press it and swipe up, or press `Ctrl+K` (`Cmd+K` on a Mac).
It answers questions about the platform and about your own account. It cannot
move funds, cannot change anything, and does not give investment advice.

How many questions you get each month depends on your tier:

| Tier | Questions per month |
|---|---|
| Unverified | 0 — complete identity verification first |
| Novice | 2 |
| Amateur | 4 |
| Strategist | 5 |
| Vanguard | Unlimited |

The allowance resets at the start of each calendar month.

**To reach a person**, use "Talk to a person" in the assistant, or "Message a
person instead" when the assistant cannot help. That opens a support ticket
with a reference like `PNP-A3F91C`. Support is available on every tier,
including unverified accounts with no assistant allowance — if you are stuck
part-way through verification, this is the channel to use.

The reply arrives as a **notification** — the bell in the dashboard header —
not by email. Support answers questions about your account and the platform;
it does not give investment advice or decide anything on your behalf either.

---

## Signal flows and automated strategies

A **Signal Flow** is an automated algorithmic strategy configured by the trader.
Traders can choose from multiple strategy templates:
- **Grid Strategy**: Automates orders across predefined price bands, capitalizing on volatility by systematically buying low and selling high within the range.
- **DCA (Dollar-Cost Averaging)**: Regularly invests a fixed amount at predetermined intervals to reduce the impact of short-term volatility on entry price.
- **Trailing Stop**: Dynamically adjusts stop-loss thresholds upward as an asset appreciates, locking in gains while allowing positions to ride market uptrends.

All signal flow profit and loss figures settle every 5 minutes and are computed deterministically by Panoply's performance model rather than executing live exchange orders.

---

## Vaults, yield and portfolio

Panoply offers two distinct investment discovery panels:
- **Vaults**: Curated platform investment strategies featuring tiered risk levels (Low, Medium, High) with structured APYs and minimum allocations.
- **Yield Aggregator**: Live decentralized finance (DeFi) pool rates aggregated from third-party protocols via DefiLlama (cached for performance). Risk bands (Low, Medium, High) are evaluated directly from protocol TVL, impermanent loss risk, and volatility metrics.
- **Portfolio Builder**: An allocation tool for traders to test and visualize asset distributions and risk balance across their selected crypto positions.

External yield rates are dynamic and describe third-party protocols; they do not represent guaranteed returns or investment advice from Panoply.

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
