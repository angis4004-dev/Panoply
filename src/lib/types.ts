export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

export type KycStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface KycInfo {
  status: KycStatus;
  submittedAt: string | null;
  fullName: string;
  dateOfBirth: string;
  country: string;
  idType: 'passport' | 'drivers_license' | 'national_id' | '';
  idNumber: string;
  documentProvided: boolean;
  rejectionReason: string | null;
}

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
