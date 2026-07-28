# Achievement & Tier Engine — Design

Sub-project 1 of 4 in the broader "Achievements and Tier Progression" initiative. This spec
covers the foundational engine: achievements, XP, tiers, Identity Score, and the Achievements
page — wired only to features that already exist in the app today. Three follow-up sub-projects
(2FA, watchlists/alerts, community/beta program) are out of scope here; each will register its
own achievements into this engine once built.

## Background

The original brief listed achievements across eight categories, several tied to features that
don't exist in this codebase (2FA, watchlists/alerts, saved multi-portfolios, backtesting,
advanced analytics, a community/beta program, email verification, editable profile fields,
real wallet-connect). Building an achievement engine whose triggers reference nonexistent
features would ship broken or permanently-unearnable achievements.

This spec resolves that by:
- Cutting achievements tied to sub-projects 2–4 (2FA, watchlists/alerts, community/beta).
- Redefining a few achievements to match how the app actually works (e.g. wallets are
  admin-assigned, not self-service "connected").
- Adding a small number of genuinely small features where an achievement's real-world
  hook was simply missing (email verification, an editable profile field, a wallet-ownership
  confirmation step) — each mirrors an existing pattern in the codebase rather than
  introducing a new one.
- Making tier progression a function of **KYC verification + lifetime deposited capital**,
  not XP — XP/achievements remain a separate, parallel progression track for profile
  flair and the Identity Score, per explicit product direction gathered during design.

## Tier & Identity Score

### Tier table

KYC verification is a hard gate for every tier, including the first one. An unverified user
has no tier and no signal-flow access at all.

| Tier | Requirement | Signal-flow slots | Portfolio Builder recommendations |
|---|---|---|---|
| *(unverified)* | KYC not verified | 0 | hidden |
| Novice | KYC verified, $0+ lifetime deposited | 1 | hidden |
| Amateur | KYC verified, $1,000+ lifetime deposited | 3 | visible |
| Strategist | KYC verified, $10,000+ lifetime deposited | 6 | visible |
| Aegis Vanguard | KYC verified, $50,000+ lifetime deposited | unlimited | visible |

"Lifetime deposited" is a cumulative counter that only increases (every successful wallet
deposit adds to it) — distinct from `walletBalance`, which decreases when capital is
allocated to a signal flow. Using live balance instead of a cumulative counter would let a
user's tier regress after they allocate funds to a bot, which is the wrong behavior for a
progression system.

Tier is recalculated (and cached on `User.tier`) whenever a triggering event occurs: a wallet
deposit, a KYC status change, or an admin wallet-address assignment. It is not recalculated
on every request.

### Enforcement

- `POST /api/bots` — before creating a bot, count the user's non-deleted bots and reject with
  a 403 ("Upgrade your tier to run more signal flows") if at or above the tier's slot limit.
  Also reject with 403 if the user has no tier (KYC not verified).
- `POST /api/portfolio-builder` — compute `recommendations` as today, but return an empty
  array with an upgrade prompt string instead when the user's tier is `unverified` or
  `novice`.

### Identity Score

Computed live (not stored) as a weighted sum, 0–100:

| Factor | Points |
|---|---|
| KYC verified | 30 |
| Wallet ownership confirmed | 15 |
| Email verified | 15 |
| Wallet connected (admin-assigned) | 10 |
| Profile completed | 10 |
| 2FA enabled | 10 (always 0 until the 2FA sub-project ships — the field exists in the formula now so no future migration is needed) |
| Achievements earned | `min(10, floor(achievementCount / 3))` |

Displayed on: Dashboard Overview, Settings, and the Achievements page header.

## Achievement catalog (v1)

The catalog is a static TypeScript config (`src/lib/achievements/catalog.ts`) — developer-edited
content, not runtime data. Each entry: `key`, `name`, `description`, `category`, `xp`,
`hasCertificate`.

### Getting Started
| Key | Trigger |
|---|---|
| `welcome_to_aegis` | Account created (signup) |
| `profile_complete` | First save of the (newly editable) Settings → Account name field |
| `email_verified` | Email verification link confirmed |
| `wallet_connected` | Admin assigns a `walletAddress` to the user |
| `dashboard_explorer` | Every nav section visited at least once |

### Security & Trust
| Key | Trigger |
|---|---|
| `verified_identity` | KYC status becomes `verified` |
| `wallet_ownership_verified` | User confirms an admin-assigned wallet via the new confirm action |
| `security_champion` | KYC verified AND wallet ownership confirmed |

### Portfolio Management
| Key | Trigger |
|---|---|
| `first_portfolio_created` | First `POST /api/portfolio-builder` success |
| `portfolio_diversifier` | A report with 3+ distinct holdings |
| `asset_explorer` | 5+ distinct tokens used across all reports (cumulative) |
| `portfolio_optimizer` | 3rd+ report generated |

### Strategy & Analytics
| Key | Trigger |
|---|---|
| `first_strategy_activated` | First signal flow (bot) created |
| `strategy_builder` | Bots created across 2+ distinct strategy types |
| `signal_explorer` | AI Center page visited |
| `risk_analyst` | First portfolio-builder report (already includes a risk score) |
| `analytics_explorer` | Report History page visited |

### Engagement
| Key | Trigger |
|---|---|
| `seven_day_streak` | 7-day consecutive login streak |
| `thirty_day_streak` | 30-day consecutive login streak |
| `consistent_user` | 90-day consecutive login streak |
| `dedicated_member` | 100 cumulative login days |

### Milestones
| Key | Trigger |
|---|---|
| `first_feature_unlock` | First achievement earned outside Getting Started |
| `amateur_tier_achieved` | Tier recalculation crosses into Amateur |
| `strategist_tier_achieved` | Tier recalculation crosses into Strategist |
| `vanguard_tier_achieved` | Tier recalculation crosses into Aegis Vanguard |

### Cut from v1 (belong to later sub-projects)
- Market Intelligence category (watchlists/alerts — sub-project 3)
- Community category (sub-project 4)
- `two_factor_enabled` (sub-project 2)
- `backtesting_complete` (no backtesting feature exists anywhere in the app)

## Data model

### `User` additions
```
emailVerified: boolean (default false; true immediately for Google-OAuth signups)
emailVerificationToken?: string
emailVerificationExpires?: Date
profileCompletedAt?: Date
walletOwnershipConfirmed: boolean (default false)
walletOwnershipConfirmedAt?: Date
lifetimeDeposited: number (default 0)
xp: number (default 0)
tier: 'unverified' | 'novice' | 'amateur' | 'strategist' | 'vanguard' (default 'unverified')
currentStreak: number (default 0)
longestStreak: number (default 0)
lastActiveDate?: Date
visitedSections: string[] (default [])
distinctPortfolioAssets: string[] (default [])
portfolioReportCount: number (default 0)
distinctBotStrategyTypes: string[] (default [])
```

### New `UserAchievement` collection
```
userId: ObjectId (ref User)
achievementKey: string
earnedAt: Date
xpAwarded: number
```
Unique compound index on `(userId, achievementKey)` — makes granting idempotent by construction.

### Engine (`src/lib/achievements/engine.ts`)
- `grantAchievement(userId, key)`: idempotent upsert into `UserAchievement`; on first grant,
  increments `User.xp`; returns whether it was newly earned.
- `recalculateTier(userId)`: reads `lifetimeDeposited` + `kycStatus`, applies the tier table,
  writes `User.tier` if changed, grants the matching tier-milestone achievement on increase.

Achievements/tier/streak logic requires a live MongoDB connection — consistent with how
bots/vaults/KYC already behave. The legacy flat-JSON-file fallback in `auth-store.ts` is not
extended to cover this system; achievement endpoints return a clean 503 if the DB is
unavailable, same as the existing bots/vaults routes.

## API surface

| Route | Change |
|---|---|
| `GET /api/achievements` | New. Full catalog + per-item earned/locked/progress, XP total, tier + progress to next tier, Identity Score breakdown, recently-unlocked list. |
| `POST /api/achievements/visit` | New. `{section}` body, marks a dashboard section visited, returns newly-earned achievements. |
| `POST /api/achievements/heartbeat` | New. Called once/day from the dashboard shell; updates login streaks. |
| `POST /api/wallet/confirm-ownership` | New. Sets `walletOwnershipConfirmed`, grants the achievement. |
| `PATCH /api/user/profile` | New. Saves the editable Settings name field; sets `profileCompletedAt` and grants Profile Complete on first save. |
| `POST /api/auth/verify-email` | New. Confirms a token (mirrors `forgot-password`/`reset-password` exactly: `crypto.randomBytes` token, 1-hour-style expiry, `sendEmail()` via existing Resend integration). Sent automatically on signup for password accounts. |
| `POST /api/bots` | Modified. Adds tier-based slot-limit + KYC-gate enforcement; grants `first_strategy_activated`/`strategy_builder`. |
| `POST /api/portfolio-builder` | Modified. Strips `recommendations` below Amateur tier; grants portfolio achievements; updates `distinctPortfolioAssets`/`portfolioReportCount`. |
| Wallet deposit route | Modified. Increments `lifetimeDeposited`; calls `recalculateTier`. |
| KYC approval route (admin) | Modified. Calls `recalculateTier`; grants `verified_identity`. |
| Admin user-edit route | Modified. Grants `wallet_connected` when `walletAddress` transitions from empty to set; calls `recalculateTier`. |

## UI

- New `/dashboard/achievements` page + sidebar nav item. Header: Identity Score + tier badge/XP
  progress. "Recently unlocked" strip. Achievement categories as card grids — earned cards show
  full color, icon, and earned date; locked cards are greyed with a progress indicator where
  applicable (e.g. "2/3 reports"). Certificate button on tier-milestone cards opens an in-app
  styled certificate modal (AEGIS branding, recipient name, achievement, date — not a
  downloadable file).
- Toast on unlock via the existing `sonner`/`addToast` pattern: "Achievement unlocked: X (+XP)".
- Identity Score widget on Dashboard Overview and Settings.
- Small tier badge in the sidebar near the user's identity, styled consistently with the
  existing KYC status dot.
- Settings → Account section becomes editable (name field + Save button).
- A small wallet card (Settings) showing the admin-assigned address and a "Confirm this is your
  wallet" button when unconfirmed.

## Testing

- Unit tests for `grantAchievement` (idempotency — granting twice doesn't double-award XP or
  create duplicate records) and `recalculateTier` (threshold boundaries, KYC gate, tier-down
  never happens since `lifetimeDeposited` is monotonic).
- API route tests for the new slot-limit and recommendation-stripping enforcement in
  `POST /api/bots` and `POST /api/portfolio-builder`, including the KYC-gate rejection case.
- API route test for the email-verification token flow (valid token, expired token, reused
  token), mirroring existing `reset-password` tests if any exist.
- Manual end-to-end verification in the browser: signup → verify email → KYC → deposit →
  tier-up → achievement unlocked toast → Achievements page reflects it → certificate modal
  opens → bot-slot limit enforced at the boundary.

## Explicitly out of scope for this sub-project

- 2FA implementation (sub-project 2) — the Identity Score formula and `security_champion`
  trigger are structured so wiring it in later is additive, not a rework.
- Watchlists/alerts (sub-project 3) and the Community/beta program (sub-project 4).
- Backtesting and "advanced analytics" achievements — no such features exist in the app; add
  achievements for them if/when those features are built.
- Downloadable PDF certificates — v1 certificates are in-app styled views only.
