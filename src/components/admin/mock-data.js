/**
 * Placeholder figures for panels not yet wired to live endpoints.
 *
 * Kept together and named so it is obvious at a glance which parts of the
 * admin dashboard are still illustrative rather than real.
 */
/* ---------------------------------- mock data ---------------------------------- */
export const mauSeries = [
  { m: 'Feb', v: 4200 },
  { m: 'Mar', v: 5800 },
  { m: 'Apr', v: 7100 },
  { m: 'May', v: 9400 },
  { m: 'Jun', v: 11800 },
  { m: 'Jul', v: 14650 },
];

export const revenueSeries = [
  { k: 'Trading fees', v: 82400 },
  { k: 'Vault fees', v: 41200 },
  { k: 'Pro subs', v: 28900 },
  { k: 'API access', v: 9600 },
];

export const retentionSeries = [
  { k: 'D7', v: 61 },
  { k: 'D30', v: 38 },
  { k: 'D90', v: 22 },
];

export const flaggedActivity = [
  {
    id: 'FA-1042',
    type: 'Anomaly',
    detail: 'Isolation forest flagged unusual withdrawal pattern',
    user: '0x7c4…9adf',
    sev: 'high',
    time: '6m ago',
  },
  {
    id: 'FA-1041',
    type: 'Fallback',
    detail: 'Grid signal flow confidence 61% — reverted to static params',
    user: '0x1b2…6f21',
    sev: 'med',
    time: '22m ago',
  },
  {
    id: 'FA-1040',
    type: 'Delivery',
    detail: 'Portfolio report email bounced (SES)',
    user: '0x9a0…3cd4',
    sev: 'low',
    time: '41m ago',
  },
  {
    id: 'FA-1039',
    type: 'Anomaly',
    detail: 'Arbitrage signal flow latency spike on routing venue',
    user: 'system',
    sev: 'med',
    time: '1h ago',
  },
  {
    id: 'FA-1038',
    type: 'Fallback',
    detail: 'DCA regime detector confidence 58% — paused contributions',
    user: '0x44e…11ba',
    sev: 'med',
    time: '2h ago',
  },
];

export const initialVaults = [
  {
    name: 'Meridian Yield',
    manager: '0x8f…3a1',
    score: 92,
    risk: 'Low',
    aum: '$4.2M',
    investors: 318,
  },
  {
    name: 'Nova Arbitrage',
    manager: '0x21…c9e',
    score: 87,
    risk: 'Med',
    aum: '$2.9M',
    investors: 204,
  },
  {
    name: 'Ledger Grid Co.',
    manager: '0x6b…7f0',
    score: 79,
    risk: 'Med',
    aum: '$1.8M',
    investors: 152,
  },
  {
    name: 'Quiet Compound',
    manager: '0x9d…4b2',
    score: 74,
    risk: 'Low',
    aum: '$1.1M',
    investors: 98,
  },
];

export const initialUsers = [
  {
    id: 'USR-001',
    name: 'Marcus Owusu',
    email: 'marcus.o@proton.me',
    risk: 'Aggressive',
    bots: 4,
    value: '$18,420',
    status: 'active',
    joined: 'Jun 2, 2026',
    wallet: '0x7c4a…9adf',
    notes: '',
  },
  {
    id: 'USR-002',
    name: 'Aiko Tanaka',
    email: 'aiko.t@gmail.com',
    risk: 'Balanced',
    bots: 2,
    value: '$62,110',
    status: 'active',
    joined: 'May 14, 2026',
    wallet: '0x1b2f…6f21',
    notes: '',
  },
  {
    id: 'USR-003',
    name: 'Priya Nair',
    email: 'priya.nair@outlook.com',
    risk: 'Conservative',
    bots: 1,
    value: '$8,050',
    status: 'active',
    joined: 'Jul 1, 2026',
    wallet: '0x9a04…3cd4',
    notes: '',
  },
  {
    id: 'USR-004',
    name: 'Diego Fernandez',
    email: 'd.fernandez@icloud.com',
    risk: 'Aggressive',
    bots: 6,
    value: '$134,900',
    status: 'flagged',
    joined: 'Mar 29, 2026',
    wallet: '0x44e1…11ba',
    notes: 'Elevated withdrawal velocity — under review.',
  },
  {
    id: 'USR-005',
    name: 'Hannah Weiss',
    email: 'hweiss@yahoo.com',
    risk: 'Balanced',
    bots: 0,
    value: '$2,300',
    status: 'onboarding',
    joined: 'Jul 10, 2026',
    wallet: '0x2f91…70c5',
    notes: '',
  },
];

export const initialBots = [
  {
    id: 'BOT-8821',
    type: 'Grid',
    pair: 'ETH/USDC',
    user: 'Marcus Owusu',
    confidence: 88,
    status: 'running',
    pnl: '+4.2%',
  },
  {
    id: 'BOT-8790',
    type: 'DCA',
    pair: 'BTC/USDC',
    user: 'Aiko Tanaka',
    confidence: 74,
    status: 'running',
    pnl: '+1.1%',
  },
  {
    id: 'BOT-8765',
    type: 'Arbitrage',
    pair: 'SOL/USDT',
    user: 'Diego Fernandez',
    confidence: 91,
    status: 'running',
    pnl: '+7.8%',
  },
  {
    id: 'BOT-8754',
    type: 'Trailing Stop',
    pair: 'ETH/USDC',
    user: 'Diego Fernandez',
    confidence: 61,
    status: 'fallback',
    pnl: '-0.6%',
  },
  {
    id: 'BOT-8701',
    type: 'DCA',
    pair: 'BTC/USDC',
    user: 'Priya Nair',
    confidence: 58,
    status: 'fallback',
    pnl: '+0.3%',
  },
];

export const vaultsQueue = [
  {
    name: 'Solstice Momentum',
    manager: '0x3e…8c1',
    strategy: 'Momentum / L2',
    fee: '20% perf',
    status: 'pending',
  },
  {
    name: 'Harbor Stable Yield',
    manager: '0x77…f4d',
    strategy: 'Stablecoin LP',
    fee: '2% mgmt',
    status: 'pending',
  },
  {
    name: 'Ridge Delta-Neutral',
    manager: '0xa1…09b',
    strategy: 'Delta-neutral',
    fee: '15% perf',
    status: 'review',
  },
];

export const initialMlModels = [
  {
    name: 'Volatility Forecast (LSTM)',
    scope: 'Grid signal flows',
    confidence: 84,
    drift: 'stable',
    retrained: '3 days ago',
  },
  {
    name: 'Risk Scoring (XGBoost)',
    scope: 'Vault manager scoring',
    confidence: 91,
    drift: 'stable',
    retrained: '6 days ago',
  },
  {
    name: 'Execution Routing (RL)',
    scope: 'Arbitrage signal flows',
    confidence: 88,
    drift: 'watch',
    retrained: '1 day ago',
  },
  {
    name: 'Anomaly Detection (Isolation Forest)',
    scope: 'Platform-wide',
    confidence: 76,
    drift: 'watch',
    retrained: '12 hours ago',
  },
];

export const reportStats = [
  { k: 'Generated today', v: '312' },
  { k: 'Delivery success', v: '98.4%' },
  { k: 'Avg. open rate', v: '61.2%' },
  { k: 'Rate-limited', v: '7' },
];

export const recentReports = [
  { id: 'RPT-55210', user: 'Aiko Tanaka', risk: 42, sent: '2m ago', status: 'delivered' },
  { id: 'RPT-55209', user: 'Hannah Weiss', risk: 68, sent: '9m ago', status: 'delivered' },
  { id: 'RPT-55208', user: 'Marcus Owusu', risk: 77, sent: '18m ago', status: 'bounced' },
  { id: 'RPT-55207', user: 'Priya Nair', risk: 29, sent: '34m ago', status: 'delivered' },
];

export const mrrTrend = [
  { m: 'Feb', v: 18200 },
  { m: 'Mar', v: 24100 },
  { m: 'Apr', v: 31900 },
  { m: 'May', v: 38400 },
  { m: 'Jun', v: 47700 },
  { m: 'Jul', v: 58200 },
];

export const tierBreakdown = [
  { tier: 'Free', users: '9,840', mrr: '$0' },
  { tier: 'Pro', users: '1,912', mrr: '$55,448' },
  { tier: 'Institutional', users: '14', mrr: '$21,300' },
];
