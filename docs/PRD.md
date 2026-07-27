# PRD: Aegis — AI-First Crypto Intelligence Platform

## 1. Executive Summary

### Product Name
Aegis

### One-Sentence Description
Aegis is a unified web application that combines automated crypto trading bots, decentralized vault investing, cross-chain yield access, and personalized portfolio reporting into a single Google-authenticated dashboard.

### Target Market
Primary targets include:
- Retail traders who want automation without deep technical expertise.
- Passive DeFi investors who want yield access without managing fragmented protocols.
- Portfolio managers who want a simple way to present and monetize strategies.
- New crypto users who need a guided, low-friction onboarding experience.

### Unique Value Proposition
Aegis differentiates itself by putting machine learning at the center of trading, yield optimization, and portfolio guidance rather than treating AI as a thin analytics layer. It also reduces onboarding friction through Google-first authentication and offers a personalized Portfolio Builder that converts holdings and goals into a structured, email-delivered investment report.

---

## 2. Product Vision

Year 1 will focus on building the core product experience: a polished homepage, Google-based sign-in, dashboard foundations, automated bot configuration, vault discovery, and a Portfolio Builder report system. The first release will establish Google authentication as the default onboarding path and make the product feel effortless from the first session.

Year 2 will expand the platform into an intelligent investing workspace by adding AI-tuned bot strategies, vault creation tools, yield prediction, and cross-chain portfolio rebalancing suggestions. These features will help users move from manual tracking to guided decision making.

Year 3 will evolve Aegis into an autonomous financial intelligence layer where AI agents manage portfolios within user-defined constraints with minimal manual effort. The experience will shift from reactive execution to predictive portfolio management, where the system anticipates risk, suggests next actions, and continuously learns from user behavior and market conditions.

---

## 3. User Personas

| Persona | Description | Primary Pain Point | Key Features Used |
|---|---|---|---|
| The Active Trader | Retail user who trades regularly and wants automation | Manual execution is exhausting and emotionally risky | Grid bots, DCA, trailing stops, real-time P&L |
| The Passive DeFi Investor | Holds crypto and wants yield without complexity | Tracking opportunities across chains is fragmented | Vault investing, yield aggregator, portfolio builder |
| The Portfolio Manager | Experienced trader who wants to attract capital | No simple way to tokenize and monetize strategy quality | Vault creation, performance tracking, fee management |
| The Newcomer | Crypto-curious but intimidated by wallets and seed phrases | Onboarding friction and security fear | Google sign-in, guided onboarding, portfolio builder report |

---

## 4. Core Feature Modules

### 4.1 Homepage
The homepage serves as the main conversion surface and should clearly communicate the product promise.

#### Required Sections
- Hero section with value proposition, Google sign-up CTA, and live dashboard preview
- Stats ticker for TVL, active bots, vaults, and supported chains
- Feature grid highlighting trading Abots, vault access, and yield intelligence
- Three-step visual journey: Connect → Choose → Earn
- Trust section with non-custodial messaging, audit language, and AI fraud-detection claims
- Testimonials from trader, investor, and portfolio-manager personas
- Pricing teaser for Free, Pro, and Institutional tiers
- Final CTA for Google sign-up and legal/footer links

### 4.2 Authentication System (Google-First)
The authentication experience is a major product differentiator and should be extremely simple.

#### Sign-Up Flow
1. User clicks “Sign Up Free with Google” on the homepage or navbar.
2. Google Identity Services initiates One Tap or OAuth sign-in.
3. Backend verifies the Google ID token and creates or links the platform account.
4. A new user is redirected into onboarding and then the dashboard.
5. The user is prompted to connect a wallet or proceed with the guided portfolio experience.

#### Sign-In Flow
1. Returning user lands on the site.
2. Google One Tap appears when supported.
3. Authentication completes automatically.
4. The user is redirected to the dashboard or prior page.

#### Technical Specs
- Library: Google Identity Services
- Scopes: openid, email, profile
- Verification: server-side JWT validation using Google public keys
- Session management: platform-issued access and refresh tokens
- Security: store google_sub as a stable identifier, enforce rate limiting, and require wallet signature for high-value actions later

### 4.3 Dashboard
The dashboard is the primary application surface after login.

#### Layout
- Sidebar navigation: Portfolio, Trading Bots, Vaults, Yield, Portfolio Builder, Settings
- Top bar: truncated wallet address, network selector, notifications, profile menu
- Main content: contextual views based on the selected module

#### Default Home View
- Portfolio value chart over 24h/7d/30d/all
- Asset allocation breakdown
- Active bots summary with run/paused status and P&L
- Recent vault activity
- Top yield opportunities
- Risk score badge
- Quick actions: Deposit, Swap, Create Bot, Build Portfolio

### 4.4 AI Trading Engine
The trading engine should provide a low-friction way for users to automate decisions without needing to manually manage every variable.

#### Supported Strategies
- Grid Bots
- DCA Bots
- Arbitrage Bots
- Trailing Stops

#### ML Enhancements
- Grid bots use volatility forecasting to adjust grid density automatically.
- DCA bots use regime detection to accelerate or pause contributions based on market conditions.
- Arbitrage bots use reinforcement learning to route efficiently across liquidity venues.
- Trailing stops use volatility-aware logic to reduce premature exits.

#### Fallback Behavior
If model confidence falls below 70%, the system should revert to user-defined static parameters rather than making a risky automated decision.

### 4.5 Decentralized Vaults (dHedge-Style Model)
Users should be able to discover, evaluate, and invest in vaults from a single interface.

#### Core Capabilities
- Browse vaults by strategy, performance, risk level, and manager reputation
- Invest into vaults and receive vault tokens representing fractional ownership
- Create vaults with strategy, fee structure, and whitelist settings

#### ML-Powered Features
- Manager scoring predicts future performance using historical behavior, risk-adjusted returns, and market-condition clustering
- Investor-vault matching recommends suitable vaults based on risk profile and user behavior
- Copy trading uses slippage prediction to reduce front-running risk for followers

### 4.6 Smart Wallet & Yield Access
The product should make cross-chain yield access intuitive and visible.

#### Scope for Initial Release
- Connect existing wallet to view and manage portfolio positions
- Surface yield opportunities across supported chains and protocols
- Display predicted 7-day and 30-day APR with explanatory context
- Suggest rebalancing actions based on predicted risk-adjusted returns

#### Future Expansion
- Account abstraction, gasless flows, and more advanced wallet automation will be added later once the core product is validated.

### 4.7 Portfolio Builder (Email Report System)
This feature is a key conversion and retention hook because it gives users a tangible outcome immediately after onboarding.

#### User Flow
1. User navigates to “Portfolio Builder” in the dashboard.
2. User fills a multi-step form:
   - Step 1: Holdings
   - Step 2: Risk Profile
   - Step 3: Goals
   - Step 4: Constraints
3. User clicks “Generate Portfolio Report”.
4. The system calculates allocation quality, concentration risk, and rebalancing suggestions.
5. A styled HTML report is emailed to the user within 60 seconds.
6. The report is also stored and viewable in-app under report history.

#### Report Contents
- Executive summary
- Current vs ideal allocation
- Risk metrics such as volatility, concentration score, and drawdown proxy
- Asset breakdown table
- Correlation overview
- Rebalancing recommendations
- Suggested vaults and yield opportunities
- Disclaimer footer

#### Technical Requirements
- Form validation with real-time checks
- Calculation engine using Python with Pandas and NumPy
- Email delivery using SendGrid or AWS SES
- Responsive HTML template with inline CSS
- Rate limit of three reports per 24 hours per user
- Storage of report JSON for history, resend, and re-download

---

## 5. Technical Architecture

### 5.1 Frontend
- Framework: Next.js 14 with App Router
- Styling: Tailwind CSS and shadcn/ui components
- Web3: RainbowKit and Wagmi for wallet connection when available
- Charts: Recharts or TradingView charting library
- State: Zustand for global UI state and React Query for server state

### 5.2 Backend
- API layer: Node.js or Python services behind an API gateway
- Authentication: Google Identity integration with JWT session management
- Database: PostgreSQL for users, portfolios, reports, and vault records
- Cache and rate limiting: Redis
- Blockchain indexing: The Graph or Goldsky for on-chain data where relevant
- Price data: CoinGecko, Chainlink, or Pyth as needed

### 5.3 Machine Learning
- Serving: FastAPI microservices for model inference
- Models: LSTM for volatility forecasting, XGBoost for risk scoring, reinforcement learning for execution optimization, and isolation forest for anomaly detection
- Training: scheduled retraining on a weekly cadence and triggered retraining when market regime shifts are detected
- Feature store: Feast or a custom Redis-backed feature registry

### 5.4 Email and Reporting
- Service: SendGrid or AWS SES
- Queue: Redis + Bull Queue or Celery for asynchronous report jobs
- Templates: Handlebars or Jinja2 for HTML report generation
- Optional export: PDF generation through Puppeteer or WeasyPrint

---

## 6. User Flows (Detailed)

### 6.1 First-Time Onboarding
User lands on homepage → clicks “Sign Up Free with Google” → Google auth completes → account is created → onboarding wizard appears → user selects experience level and risk tolerance → dashboard opens.

### 6.2 Trading Bot Creation
Dashboard → Trading Bots → Create Bot → select strategy → select pair → AI suggests parameters → review risk and simulated returns → confirm → bot goes live.

### 6.3 Vault Investment
Dashboard → Vaults → browse list → filter by strategy or risk → open vault details → review manager score and historical metrics → enter deposit amount → confirm → view investment in portfolio.

### 6.4 Portfolio Builder and Email Report
Dashboard → Portfolio Builder → fill holdings and risk form → click generate → report is created in seconds → HTML report is emailed → report appears in history for later access.

### 6.5 Yield Discovery
Dashboard → Yield → review ranked opportunities → inspect predicted return and risk profile → choose allocation suggestion → apply rebalancing or view in portfolio.

---

## 7. Data Model (Key Entities)

### User
- id
- google_sub
- email
- name
- avatar_url
- risk_profile
- created_at
- updated_at

### Portfolio Report
- id
- user_id
- report_data (JSONB)
- risk_score
- email_sent_at
- email_status
- created_at

### Trading Bot
- id
- user_id
- type
- pair
- parameters (JSONB)
- status
- allocated_capital
- realized_pnl
- created_at

### Vault Investment
- id
- user_id
- vault_address
- vault_tokens
- entry_nav
- current_nav
- deposited_at

---

## 8. API Endpoints (Core)

| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/google | Verify Google ID token and create or login user |
| POST | /api/auth/refresh | Refresh platform JWT |
| GET | /api/dashboard | Fetch dashboard data |
| POST | /api/bots | Create a new trading bot |
| GET | /api/bots | List user bots |
| GET | /api/vaults | List available vaults |
| POST | /api/vaults/:id/invest | Invest in a vault |
| POST | /api/portfolio-builder | Submit portfolio data and trigger report generation |
| GET | /api/portfolio-builder/reports | List report history |
| GET | /api/portfolio-builder/reports/:id | Download a specific report |
| POST | /api/portfolio-builder/reports/:id/resend | Resend report email |

---

## 9. Monetization Model

### Revenue Streams
- Trading fees on execution
- Vault performance fees and management fees
- Premium AI subscriptions for advanced strategy tuning and portfolio modeling
- API access for third-party developers and institutions

### Pricing Tiers
| Tier | Price | Features |
|---|---:|---|
| Free | $0 | Basic wallet connection, two active bots, portfolio builder with limited reports, basic vault access |
| Pro | $29/month | Unlimited bots, AI parameter tuning, unlimited portfolio reports, premium vault insights |
| Institutional | Custom | API access, sub-accounts, advanced risk engine, quota-based support |

---

## 10. Security & Compliance

### Product Principles
- Non-custodial-first experience where users retain control of their assets wherever possible
- Google authentication verified server-side with stable user identity
- High-value actions require explicit confirmation and wallet signature where applicable
- GDPR-friendly data practices and encrypted storage for user records

### Risk Disclosures
The product must include mandatory disclaimers such as:
- “Not financial advice”
- “Crypto is volatile”
- “Past performance does not guarantee future results”

### ML Governance
Model outputs should include confidence intervals and explainable reasoning where relevant. No product experience should imply guaranteed returns.

---

## 11. Roadmap

| Phase | Timeline | Deliverables |
|---|---|---|
| Phase 1: Foundation | Months 1–3 | Homepage, Google auth, dashboard, Portfolio Builder v1 with email reports |
| Phase 2: Trading | Months 4–6 | Grid and DCA bots, AI parameter suggestions, vault browsing and investing |
| Phase 3: Intelligence | Months 7–9 | AI-tuned strategies, yield prediction, rebalancing suggestions, cross-chain portfolio insights |
| Phase 4: Autonomy | Months 10–12 | Autonomous AI agents, institutional APIs, richer vault creation and reporting workflows |

---

## 12. Success Metrics

### Business KPIs
- Monthly active users
- Sign-up conversion rate from homepage to Google-authenticated account
- Portfolio Builder report generation rate
- Email open rate for portfolio reports
- TVL or AUM
- Trading volume
- Vault investment volume
- Retention at D7, D30, and D90

### Product KPIs
- Time to first bot creation
- Portfolio Builder form completion rate
- Email report delivery success rate
- Support ticket volume per feature
