/**
 * Content of the independent security assessment, kept out of the page
 * component in the same way about-content.ts is.
 *
 * Two deliberate constraints on anything rendered from this file:
 *
 * 1. The report states no per-severity finding counts. Do not render a
 *    "0 critical / 0 high" badge or any tally - the source does not support
 *    one, and an invented count on a page about security is the worst possible
 *    place to guess.
 * 2. The conclusion is conditional: "Subject to the remediation of the
 *    findings presented in this report". Language on the site must not
 *    upgrade that into an unconditional pass.
 */

export const AUDIT = {
  auditor: 'Obsidian Audits',
  reviewDate: 'March 18, 2026',
  title: 'AEGIS Security Review',
  subtitle: 'Independent Smart Contract Security Assessment',
} as const;

export const AUDITOR_INTRO = [
  'Obsidian Audits is a blockchain security research organization specializing in decentralized finance (DeFi), smart contract security, protocol architecture, and digital asset infrastructure.',
  'The team provides comprehensive security assessments for protocols deployed across EVM-compatible blockchains and emerging decentralized ecosystems. Every audit combines automated analysis, manual code review, threat modeling, and adversarial testing to identify vulnerabilities before deployment.',
  'The objective of every engagement is to improve protocol security, protect user assets, and strengthen the reliability of decentralized applications through independent verification and actionable remediation guidance.',
];

export const AUDIT_OBJECTIVE = [
  'User funds',
  'Protocol integrity',
  'Access control',
  'Asset accounting',
  'Smart contract execution',
  'Oracle integrations',
  'Strategy execution',
  'Portfolio valuation',
  'Cross-chain operations',
  'Vault security',
  'Administrative permissions',
];

export const AUDIT_SCOPE = [
  {
    group: 'Core Protocol',
    items: [
      'Vault Management Contracts',
      'Portfolio Management Engine',
      'Strategy Execution Engine',
      'Signal Intelligence Engine',
      'Risk Management Engine',
      'Treasury Management Contracts',
      'User Registry',
      'Access Control Framework',
      'Governance Contracts',
    ],
  },
  {
    group: 'Financial Infrastructure',
    items: [
      'Asset Accounting',
      'Portfolio Valuation',
      'Yield Distribution',
      'Performance Fee Logic',
      'Deposit and Withdrawal Mechanisms',
      'Reward Distribution',
    ],
  },
  {
    group: 'External Integrations',
    items: [
      'Oracle Integrations',
      'Multi-Chain Infrastructure',
      'Wallet Authentication',
      'Identity Verification (KYC) Interfaces',
      'External Analytics Providers',
    ],
  },
  {
    group: 'Supporting Infrastructure',
    items: [
      'Administrative Roles',
      'Emergency Controls',
      'Upgradeability Mechanisms',
      'Configuration Management',
      'Event Logging',
      'Monitoring Hooks',
    ],
  },
];

export const METHODOLOGY = [
  {
    name: 'Architecture Review',
    desc: 'Evaluation of protocol design, contract interactions, and trust assumptions.',
  },
  {
    name: 'Manual Code Review',
    desc: 'Line-by-line inspection of all contracts to identify logic flaws, unsafe assumptions, authorization issues, and state-transition errors.',
  },
  {
    name: 'Automated Analysis',
    desc: 'Static analysis tools were used to detect known vulnerability patterns, insecure coding practices, and dependency risks.',
  },
  {
    name: 'Threat Modeling',
    desc: 'Potential attack scenarios were modeled to evaluate protocol resilience against malicious actors.',
  },
  {
    name: 'Economic Analysis',
    desc: 'Protocol incentives, vault accounting, portfolio valuation, and strategy execution were reviewed for manipulation risks.',
  },
  {
    name: 'Access Control Review',
    desc: 'Administrative privileges, governance permissions, and privileged execution paths were evaluated for abuse potential.',
  },
  {
    name: 'Oracle Validation',
    desc: 'Price feeds and external data dependencies were analyzed to ensure resistance against manipulation and stale data.',
  },
  {
    name: 'Cross-Chain Security',
    desc: 'Cross-chain interactions, bridge assumptions, and asynchronous settlement mechanisms were reviewed for consistency and safety.',
  },
];

export const SECURITY_PRINCIPLES = [
  'Asset Safety',
  'Least Privilege',
  'Deterministic State Transitions',
  'Transparent Accounting',
  'Accurate Portfolio Valuation',
  'Reliable Oracle Usage',
  'Secure Cross-Chain Communication',
  'Defense in Depth',
  'Fail-Safe Defaults',
  'Operational Transparency',
];

/**
 * `tone` selects a semantic colour on the page. It intentionally maps only to
 * warning/negative/muted - there is no "positive" severity, and the value
 * tokens are reserved for the sign of a number elsewhere in the app, so this
 * page uses them purely as a severity ramp and nothing else.
 */
export const SEVERITIES = [
  {
    level: 'Critical',
    tone: 'negative' as const,
    description:
      'May lead to immediate and severe compromise of protocol security - direct theft of user funds, complete protocol compromise, permanent denial of service, or unauthorized control of privileged functions.',
    action: 'Resolve before deployment',
  },
  {
    level: 'High',
    tone: 'negative' as const,
    description:
      'Significant security risk that could result in substantial financial loss under realistic attack conditions - major accounting inconsistencies, access control weaknesses, oracle manipulation, or privilege escalation.',
    action: 'High priority remediation',
  },
  {
    level: 'Medium',
    tone: 'warning' as const,
    description:
      'May not directly compromise protocol security but can expose users or administrators to meaningful operational or financial risk - edge-case logic failures, incorrect validation, or misconfigured permissions.',
    action: 'Resolve before major release',
  },
  {
    level: 'Low',
    tone: 'muted' as const,
    description:
      'Minor security weaknesses, best-practice violations, or defensive improvements - minor validation issues, gas inefficiencies, event inconsistencies, or configuration improvements.',
    action: 'Address during development cycle',
  },
  {
    level: 'Informational',
    tone: 'muted' as const,
    description:
      'Not exploitable vulnerabilities, but opportunities to improve code readability, documentation, maintainability, testing, developer experience, and operational processes.',
    action: 'Consider for future improvements',
  },
];

export const STRENGTHENED = [
  'Access control validation',
  'Input validation',
  'Emergency recovery procedures',
  'Oracle dependency management',
  'Strategy execution safeguards',
  'Administrative controls',
  'Event consistency',
  'Documentation quality',
  'Automated testing coverage',
];

export const OBSERVED = [
  'Clear separation of responsibilities between core modules.',
  'Well-defined administrative boundaries.',
  'Transparent accounting mechanisms.',
  'Comprehensive event logging.',
  'Modular contract architecture.',
  'Strong consideration for operational risk.',
];

export const ONGOING_RECOMMENDATIONS = [
  'Continuous security monitoring.',
  'Independent audits for major upgrades.',
  'Expanded automated testing.',
  'Formal verification of critical financial logic where feasible.',
  'Regular dependency reviews.',
  'Bug bounty programs.',
  'Periodic penetration testing.',
  'Governance security assessments.',
];

export const DISCLAIMER =
  'This assessment reflects the security posture of the reviewed codebase at the time of the audit. While extensive testing and manual review were performed, no audit can guarantee the complete absence of vulnerabilities. Security is an ongoing process, and continuous monitoring, testing, and periodic reassessment are recommended as the AEGIS protocol evolves.';
