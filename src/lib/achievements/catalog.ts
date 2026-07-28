export type AchievementCategory =
  | 'getting-started'
  | 'security-trust'
  | 'portfolio'
  | 'strategy-analytics'
  | 'engagement'
  | 'milestones';

export type AchievementKey =
  | 'welcome_to_aegis'
  | 'profile_complete'
  | 'email_verified'
  | 'wallet_connected'
  | 'dashboard_explorer'
  | 'verified_identity'
  | 'wallet_ownership_verified'
  | 'security_champion'
  | 'first_portfolio_created'
  | 'portfolio_diversifier'
  | 'asset_explorer'
  | 'portfolio_optimizer'
  | 'first_strategy_activated'
  | 'strategy_builder'
  | 'signal_explorer'
  | 'risk_analyst'
  | 'analytics_explorer'
  | 'seven_day_streak'
  | 'thirty_day_streak'
  | 'consistent_user'
  | 'dedicated_member'
  | 'first_feature_unlock'
  | 'amateur_tier_achieved'
  | 'strategist_tier_achieved'
  | 'vanguard_tier_achieved';

export interface AchievementDefinition {
  key: AchievementKey;
  name: string;
  description: string;
  category: AchievementCategory;
  xp: number;
  hasCertificate: boolean;
}

export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  // Getting Started
  {
    key: 'welcome_to_aegis',
    name: 'Welcome to AEGIS',
    description: 'Create your account.',
    category: 'getting-started',
    xp: 25,
    hasCertificate: false,
  },
  {
    key: 'profile_complete',
    name: 'Profile Complete',
    description: 'Complete your profile information.',
    category: 'getting-started',
    xp: 50,
    hasCertificate: false,
  },
  {
    key: 'email_verified',
    name: 'Email Verified',
    description: 'Verify your email address.',
    category: 'getting-started',
    xp: 50,
    hasCertificate: false,
  },
  {
    key: 'wallet_connected',
    name: 'Wallet Connected',
    description: 'Have a wallet address assigned to your account.',
    category: 'getting-started',
    xp: 50,
    hasCertificate: false,
  },
  {
    key: 'dashboard_explorer',
    name: 'Dashboard Explorer',
    description: 'Visit every major dashboard section.',
    category: 'getting-started',
    xp: 75,
    hasCertificate: false,
  },
  // Security & Trust
  {
    key: 'verified_identity',
    name: 'Verified Identity',
    description: 'Complete KYC verification.',
    category: 'security-trust',
    xp: 150,
    hasCertificate: false,
  },
  {
    key: 'wallet_ownership_verified',
    name: 'Wallet Ownership Verified',
    description: 'Confirm ownership of your assigned wallet.',
    category: 'security-trust',
    xp: 75,
    hasCertificate: false,
  },
  {
    key: 'security_champion',
    name: 'Security Champion',
    description: 'Complete every available security setting.',
    category: 'security-trust',
    xp: 100,
    hasCertificate: false,
  },
  // Portfolio Management
  {
    key: 'first_portfolio_created',
    name: 'First Portfolio Created',
    description: 'Generate your first portfolio report.',
    category: 'portfolio',
    xp: 50,
    hasCertificate: false,
  },
  {
    key: 'portfolio_diversifier',
    name: 'Portfolio Diversifier',
    description: 'Build a portfolio with 3 or more distinct holdings.',
    category: 'portfolio',
    xp: 75,
    hasCertificate: false,
  },
  {
    key: 'asset_explorer',
    name: 'Asset Explorer',
    description: 'Use 5 or more distinct supported assets.',
    category: 'portfolio',
    xp: 100,
    hasCertificate: false,
  },
  {
    key: 'portfolio_optimizer',
    name: 'Portfolio Optimizer',
    description: 'Generate 3 or more portfolio reports.',
    category: 'portfolio',
    xp: 100,
    hasCertificate: false,
  },
  // Strategy & Analytics
  {
    key: 'first_strategy_activated',
    name: 'First Strategy Activated',
    description: 'Create your first signal flow.',
    category: 'strategy-analytics',
    xp: 50,
    hasCertificate: false,
  },
  {
    key: 'strategy_builder',
    name: 'Strategy Builder',
    description: 'Create signal flows using 2 or more distinct strategy types.',
    category: 'strategy-analytics',
    xp: 100,
    hasCertificate: false,
  },
  {
    key: 'signal_explorer',
    name: 'Signal Explorer',
    description: 'View AI-generated signals in the AI Center.',
    category: 'strategy-analytics',
    xp: 50,
    hasCertificate: false,
  },
  {
    key: 'risk_analyst',
    name: 'Risk Analyst',
    description: 'Generate your first risk report.',
    category: 'strategy-analytics',
    xp: 75,
    hasCertificate: false,
  },
  {
    key: 'analytics_explorer',
    name: 'Analytics Explorer',
    description: 'Visit Report History.',
    category: 'strategy-analytics',
    xp: 50,
    hasCertificate: false,
  },
  // Engagement
  {
    key: 'seven_day_streak',
    name: 'Seven Day Active Streak',
    description: 'Stay active for 7 consecutive days.',
    category: 'engagement',
    xp: 100,
    hasCertificate: false,
  },
  {
    key: 'thirty_day_streak',
    name: 'Thirty Day Active Streak',
    description: 'Stay active for 30 consecutive days.',
    category: 'engagement',
    xp: 250,
    hasCertificate: false,
  },
  {
    key: 'consistent_user',
    name: 'Consistent User',
    description: 'Remain active for 90 consecutive days.',
    category: 'engagement',
    xp: 500,
    hasCertificate: false,
  },
  {
    key: 'dedicated_member',
    name: 'Dedicated Member',
    description: 'Log in for 100 cumulative days.',
    category: 'engagement',
    xp: 400,
    hasCertificate: false,
  },
  // Milestones
  {
    key: 'first_feature_unlock',
    name: 'First Feature Unlock',
    description: 'Earn your first achievement beyond Getting Started.',
    category: 'milestones',
    xp: 25,
    hasCertificate: false,
  },
  {
    key: 'amateur_tier_achieved',
    name: 'Amateur Tier Achieved',
    description: 'Reach Amateur tier.',
    category: 'milestones',
    xp: 100,
    hasCertificate: true,
  },
  {
    key: 'strategist_tier_achieved',
    name: 'Strategist Tier Achieved',
    description: 'Reach Strategist tier.',
    category: 'milestones',
    xp: 200,
    hasCertificate: true,
  },
  {
    key: 'vanguard_tier_achieved',
    name: 'Aegis Vanguard Achieved',
    description: 'Reach Aegis Vanguard tier.',
    category: 'milestones',
    xp: 500,
    hasCertificate: true,
  },
];

export function getAchievementDefinition(key: AchievementKey): AchievementDefinition {
  const def = ACHIEVEMENT_CATALOG.find((a) => a.key === key);
  if (!def) throw new Error(`Unknown achievement key: ${key}`);
  return def;
}
