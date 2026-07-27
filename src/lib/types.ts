export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

export interface Holding {
  token: string;
  amount: number;
  price: number;
  value: number;
  chain: string;
}

export interface PortfolioReport {
  id: number | string;
  date: string;
  riskProfile: RiskProfile;
  totalValue: number;
  riskScore: string;
  holdings: Holding[];
  recommendations: string[];
  metrics: {
    concentration: number;
    volatility: number;
    sharpe: string;
    targetReturn: number;
  };
  email: string;
  status: 'sent' | 'success' | 'failed' | 'pending';
}
