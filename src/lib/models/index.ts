export { TradingBotModel } from './TradingBot';
export { MLModelModel } from './MLModel';
export { VaultModel } from './Vault';
export { YieldOpportunityModel } from './YieldOpportunity';
export { UserVaultInvestmentModel } from './UserVaultInvestment';
export { UserYieldInvestmentModel } from './UserYieldInvestment';
export { ReportModel } from './Report';
export { UserAchievementModel } from './UserAchievement';

// Import User model from mongo.ts
import { getUserModel } from '../mongo';
export { getUserModel };
