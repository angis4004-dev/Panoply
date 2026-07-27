export const MOTTO = 'Quantitative Intelligence for Decentralized Finance';

export const CORE_PRINCIPLES = [
  {
    title: 'Non-Custodial by Design',
    desc: 'Aegis never takes custody of user assets. Every strategy executes directly against your own wallet and permissions.',
  },
  {
    title: 'Risk Before Return',
    desc: 'Every signal passes through position sizing, exposure, and volatility checks before execution is ever considered.',
  },
  {
    title: 'Transparent Analytics',
    desc: 'Performance, allocations, and risk metrics are visible in the dashboard in real time - no obscured reporting.',
  },
  {
    title: 'Continuous Monitoring',
    desc: 'Active positions are monitored around the clock, with automated logic for drawdowns and volatility shifts.',
  },
  {
    title: 'Data-Driven Iteration',
    desc: 'Strategies are refined through backtesting and historical analysis, not discretionary guesswork.',
  },
] as const;

export const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Signal Generation',
    desc: 'Quantitative models analyze market data, on-chain metrics, and historical patterns to generate candidate trade signals.',
  },
  {
    step: '02',
    title: 'Risk Assessment',
    desc: 'Every signal is evaluated against position sizing, exposure limits, and volatility conditions before it can be acted on.',
  },
  {
    step: '03',
    title: 'Automated Execution',
    desc: 'Approved signals execute non-custodially across supported chains and protocols, with parameters you configure.',
  },
  {
    step: '04',
    title: 'Continuous Monitoring',
    desc: 'Open positions are tracked in real time, with stop-loss, take-profit, and drawdown logic running continuously.',
  },
] as const;

export interface StrategyCategory {
  name: string;
  purpose: string;
  useCase: string;
  riskProfile: string;
  behavior: string;
}

export const STRATEGY_CATEGORIES: StrategyCategory[] = [
  {
    name: 'Arbitrage',
    purpose: 'Captures price discrepancies for the same asset across exchanges or liquidity pools.',
    useCase: 'Short-duration positions between correlated markets.',
    riskProfile: 'Low-to-moderate. Primary risks are execution latency and slippage.',
    behavior: 'Small, frequent gains with low correlation to overall market direction.',
  },
  {
    name: 'Market Neutral',
    purpose:
      'Combines long and short exposure to isolate returns from a specific spread or factor.',
    useCase: 'Pairs trading and basis strategies that reduce directional market exposure.',
    riskProfile: 'Moderate. Depends on correlation stability between paired positions.',
    behavior: 'Returns largely independent of overall market direction.',
  },
  {
    name: 'Yield Optimization',
    purpose:
      'Allocates capital across lending, staking, and liquidity protocols for risk-adjusted yield.',
    useCase: 'Idle or long-term capital seeking on-chain yield with active monitoring.',
    riskProfile: 'Low-to-moderate. Primary risks are protocol and smart-contract risk.',
    behavior: 'Steady, compounding returns with periodic rebalancing.',
  },
  {
    name: 'Portfolio Rebalancing',
    purpose: 'Maintains target allocations across assets as market values shift over time.',
    useCase:
      'Long-term holders who want disciplined exposure management without manual intervention.',
    riskProfile: 'Low. Reduces concentration risk rather than seeking alpha.',
    behavior: 'Gradual drift correction back toward target portfolio weights.',
  },
  {
    name: 'Hedging',
    purpose: 'Reduces downside exposure using derivatives or offsetting positions.',
    useCase: 'Protecting existing holdings during periods of elevated volatility.',
    riskProfile: 'Moderate. Hedging costs can reduce upside during calm markets.',
    behavior: 'Reduced portfolio volatility and smaller drawdowns.',
  },
  {
    name: 'Liquidity Strategies',
    purpose: 'Provides liquidity to automated market makers in exchange for trading fees.',
    useCase: 'Capital allocated to stable or correlated pairs seeking fee income.',
    riskProfile: 'Moderate. Impermanent loss is the primary risk factor.',
    behavior: 'Fee-driven returns that vary with trading volume and pool composition.',
  },
  {
    name: 'Trend Following',
    purpose: 'Enters positions aligned with an established directional price trend.',
    useCase: 'Medium-term positioning during sustained market moves.',
    riskProfile: 'Moderate-to-high. Underperforms in choppy, range-bound markets.',
    behavior: 'Larger, less frequent gains concentrated during trending periods.',
  },
  {
    name: 'Momentum',
    purpose: 'Targets assets showing statistically significant recent outperformance.',
    useCase: 'Shorter-term positioning that rotates with relative strength shifts.',
    riskProfile: 'Moderate-to-high. Sensitive to sudden reversals.',
    behavior: 'Performance clustered around momentum regime shifts.',
  },
  {
    name: 'Mean Reversion',
    purpose:
      'Positions against short-term price extremes, expecting reversion toward historical averages.',
    useCase: 'Range-bound or high-volatility conditions with statistically identifiable extremes.',
    riskProfile: 'Moderate. Risk increases materially during structural trend breaks.',
    behavior: 'Frequent, smaller gains with occasional larger drawdowns during regime changes.',
  },
  {
    name: 'AI-Assisted Signal Generation',
    purpose:
      'Uses quantitative and machine-learning models to identify patterns across market and on-chain data.',
    useCase: 'Complements rule-based strategies with adaptive, data-driven signal input.',
    riskProfile:
      'Moderate. Model output is one input among several risk checks, never a standalone decision.',
    behavior: 'Signals are continuously evaluated and re-weighted as new data becomes available.',
  },
];

export const RISK_FRAMEWORK = [
  {
    title: 'Position Sizing',
    desc: 'Every allocation is sized relative to portfolio value and configured risk tolerance.',
  },
  {
    title: 'Exposure Limits',
    desc: 'Caps on per-asset and per-strategy exposure prevent concentration in any single position.',
  },
  {
    title: 'Diversification',
    desc: 'Strategy and asset mix is monitored to avoid unintended correlation across a portfolio.',
  },
  {
    title: 'Stop-Loss Logic',
    desc: 'Automated exit conditions limit downside on individual positions.',
  },
  {
    title: 'Take-Profit Logic',
    desc: 'Defined exit targets lock in gains rather than relying on discretionary timing.',
  },
  {
    title: 'Volatility Monitoring',
    desc: 'Elevated volatility conditions can adjust sizing or pause execution automatically.',
  },
  {
    title: 'Liquidity Monitoring',
    desc: 'Execution accounts for available on-chain liquidity to reduce slippage risk.',
  },
  {
    title: 'Portfolio Analytics',
    desc: 'Real-time dashboards surface concentration, volatility, and performance metrics.',
  },
  {
    title: 'Stress Testing',
    desc: 'Strategies are evaluated against historical drawdown and volatility scenarios.',
  },
  {
    title: 'Historical Backtesting',
    desc: 'Signal logic is tested against historical data before being made available in the platform.',
  },
  {
    title: 'Continuous Monitoring',
    desc: 'Automated systems track open positions and account health around the clock.',
  },
] as const;

export const ROADMAP = [
  {
    phase: 'Phase 1 — Foundation',
    status: 'Current',
    items: [
      'Core signal generation and automated bot execution',
      'Risk-managed vault infrastructure',
      'Portfolio Builder and yield discovery tools',
      'Real-time portfolio analytics dashboard',
    ],
  },
  {
    phase: 'Phase 2 — Expansion',
    status: 'In progress',
    items: [
      'Expanded multi-chain execution coverage',
      'Deeper backtesting and strategy analytics tools',
      'Enhanced volatility and exposure monitoring',
    ],
  },
  {
    phase: 'Phase 3 — Institutional Tooling',
    status: 'Planned',
    items: [
      'Exportable institutional-grade reporting',
      'Expanded strategy library and customization',
      'Deeper cross-chain liquidity integrations',
    ],
  },
] as const;

export const FAQ_ITEMS = [
  {
    question: 'Is Aegis custodial?',
    answer:
      'No. Aegis is non-custodial - strategies execute against your own wallet, and Aegis never takes control of your assets or private keys.',
  },
  {
    question: 'Does Aegis guarantee returns?',
    answer:
      'No. All strategies carry risk, including the risk of loss. Aegis provides disciplined, risk-aware automation and transparent analytics - not a promise of profit. Past performance does not indicate future results.',
  },
  {
    question: 'Which chains does Aegis support?',
    answer:
      'Aegis is built for multi-chain DeFi automation. Supported chains expand over time as strategies and integrations are validated - see the Roadmap for current priorities.',
  },
  {
    question: 'How does risk management actually work?',
    answer:
      'Every signal passes through position sizing, exposure limits, and volatility checks before execution. Open positions are monitored continuously, with automated stop-loss and take-profit logic. See the Risk Framework section for the full set of controls.',
  },
  {
    question: 'Can I customize a strategy?',
    answer:
      'Yes. The Portfolio Builder and bot configuration tools let you set risk parameters, allocation limits, and strategy type rather than relying on a single fixed approach.',
  },
  {
    question: 'Can I stop or withdraw at any time?',
    answer:
      'Yes. Because Aegis is non-custodial, you retain full control of your assets and can pause strategies or withdraw at any time from your own wallet.',
  },
] as const;
