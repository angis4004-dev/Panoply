/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Produced by scripts/build-copilot-corpus.mjs from the markdown under docs/.
 * Edit the documentation and re-run the script; editing this file directly
 * means the next run silently discards your change.
 */

export interface CorpusChunk {
  source: string;
  text: string;
}

export const COPILOT_CORPUS: CorpusChunk[] = [
  {
    source: 'Panoply — what it is',
    text: '> Quantitative intelligence for decentralized finance.\n\nPanoply is a non-custodial DeFi automation platform. A trader configures\nautomated strategies, tracks a portfolio, discovers yield, and completes\nidentity verification; an internal operations team reviews those identities,\npublishes deposit addresses, and confirms transfers on-chain.\n\nThis document describes the system **as it is actually built**, including the\nparts that are simulated. It is written from the code, not from the marketing\ncopy. Read the "What is real, what is simulated" section before showing this\nproduct to anyone who might put money into it.\n\n---',
  },
  {
    source: 'Panoply — what it is — What a trader can do',
    text: '### Public pages\n`/` landing, `/about`, `/security`, `/tiers`, `/charts`, `/signal-flows`, plus\n`/terms`, `/privacy`, `/disclaimer`.\n\n### Behind sign-in — `/dashboard`\n\n| Page | Purpose |\n|---|---|\n| **Overview** | Wallet balance, signal-flow count, identity score, top yields |\n| **Signal Flows** (`/bots`) | Create and manage automated strategies |\n| **Portfolio Builder** (`/builder`) | Allocate across assets, risk analysis |\n| **Vaults** | Investment products with APY and risk levels |\n| **Yield** | Live third-party pool rates from DefiLlama, with risk bands |\n| **Ask Panoply** (`/ai`) | In-app assistant and support |\n| **Achievements** | Progress, milestones, trust score |\n| **Verification** (`/kyc`) | Identity documents |\n| **Report History** | Generated performance reports |\n| **Settings** | Profile, sign-in PIN, wallet confirmation |\n\n---',
  },
  {
    source: 'Panoply — what it is — How money actually moves',
    text: 'This is the part most worth understanding, because it is not what a casual\nreader assumes.\n\n1. An operator publishes a **platform-wide deposit address** per asset from\n   the console. Addresses are not per-user.\n2. A verified trader opens the deposit modal, sends funds to that address from\n   their own wallet, and submits the **transaction hash**.\n3. Because everyone deposits to the same pooled address, that hash is the only\n   thing linking a transfer to an account.\n4. Submitting **credits nothing**. It creates a pending claim.\n5. An operator matches the transfer on-chain and approves it. Only then does\n   the balance change.\n\nThe deposit modal states this plainly, because a trader who expects an instant\nbalance and does not get one files a support ticket — and the fix for that is\nthe sentence, not a spinner.\n\nDeposit addresses, memo tags, ticker symbols and network names all carry\n`translate="no"`. A browser translator rewriting a base58 address sends money\nsomewhere unrecoverable.\n\n---',
  },
  {
    source: 'Panoply — what it is — Tiers and progression',
    text: 'Tier is derived from **lifetime deposited**, and gated behind KYC — an\nunverified account has no tier at all, regardless of deposits.\n\n| Tier | Lifetime deposited | Concurrent signal flows |\n|---|---|---|\n| Unverified | — | 0 |\n| Novice | $0 | 1 |\n| Amateur | $1,000 | 3 |\n| Strategist | $10,000 | 6 |\n| Vanguard | $50,000 | Unlimited |\n\nAn **Identity Score** (0–100) is computed server-side from verifiable state:\nKYC verified (+30), wallet ownership confirmed (+15), email verified (+15),\nwallet address assigned (+10), profile completed (+10), plus up to 10 from\nachievement count.\n\n---',
  },
  {
    source: 'Panoply — what it is — Getting help',
    text: '**Ask Panoply** is the in-app assistant, reachable two ways: the "Ask Panoply"\nentry in the dashboard sidebar, and the floating button on every other\ndashboard page — press it and swipe up, or press `Ctrl+K` (`Cmd+K` on a Mac).\nIt answers questions about the platform and about your own account. It cannot\nmove funds, cannot change anything, and does not give investment advice.\n\nHow many questions you get each month depends on your tier:\n\n| Tier | Questions per month |\n|---|---|\n| Unverified | 0 — complete identity verification first |\n| Novice | 2 |\n| Amateur | 4 |\n| Strategist | 5 |\n| Vanguard | Unlimited |\n\nThe allowance resets at the start of each calendar month.\n\n**To reach a person**, use "Talk to a person" in the assistant, or "Message a\nperson instead" when the assistant cannot help. That opens a support ticket\nwith a reference like `PNP-A3F91C`. Support is available on every tier,\nincluding unverified accounts with no assistant allowance — if you are stuck\npart-way through verification, this is the channel to use.\n\nThe reply arrives as a **notification** — the bell in the dashboard header —\nnot by email. Support answers questions about your account and the platform;\nit does not give investment advice or decide anything on your behalf either.\n\n---',
  },
  {
    source: 'Panoply — what it is — Signal flows and automated strategies',
    text: "A **Signal Flow** is an automated algorithmic strategy configured by the trader.\nTraders can choose from multiple strategy templates:\n- **Grid Strategy**: Automates orders across predefined price bands, capitalizing on volatility by systematically buying low and selling high within the range.\n- **DCA (Dollar-Cost Averaging)**: Regularly allocates capital at predetermined intervals to reduce the impact of short-term volatility on entry price.\n- **Trailing Stop**: Dynamically adjusts stop-loss thresholds upward as an asset appreciates, locking in gains while allowing positions to ride market uptrends.\n\nAll signal flow profit and loss figures settle every 5 minutes and are computed deterministically by Panoply's performance model rather than executing live exchange orders.\n\n---",
  },
  {
    source: 'Panoply — what it is — Vaults, yield and portfolio',
    text: 'Panoply offers two distinct investment discovery panels:\n- **Vaults**: Curated platform investment strategies featuring tiered risk levels (Low, Medium, High) with structured APYs and minimum allocations.\n- **Yield Aggregator**: Live decentralized finance (DeFi) pool rates aggregated from third-party protocols via DefiLlama (cached for performance). Risk bands (Low, Medium, High) are evaluated directly from protocol TVL, impermanent loss risk, and volatility metrics.\n- **Portfolio Builder**: An allocation tool for traders to test and visualize asset distributions and risk balance across their selected crypto positions.\n\nExternal yield rates are dynamic and describe third-party protocols; they do not represent guaranteed returns or investment advice from Panoply.\n\n---',
  },
  {
    source: 'Panoply — what it is — Security model',
    text: "- **Password + PIN.** A six-digit PIN is required *after* the password, asked\n  for at the dashboard door rather than at sign-in. Verified server-side at\n  `/api/auth/pin/verify`.\n- **The gate does not hide the dashboard, it withholds it.** `PinGate` renders\n  children only once the PIN is accepted — not blurred, not overlaid. No\n  dashboard component mounts, no effect runs, no balance is ever fetched. An\n  overlay would still have loaded everything underneath it.\n- **Host isolation** between trader and console, as above.\n- **Admin responses** carry `no-store`, `frame-ancestors 'none'`, a strict CSP,\n  and `X-Robots-Tag: noindex`. Every admin page is account data.\n- **KYC documents** are encrypted at rest and served only through an\n  authenticated admin route.\n- **Audit log** (`AdminAuditLog`) records operator actions.\n\n---",
  },
];
