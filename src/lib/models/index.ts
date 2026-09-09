export { TradingBotModel } from './TradingBot';
export { MLModelModel } from './MLModel';
export { VaultModel } from './Vault';
export { YieldOpportunityModel } from './YieldOpportunity';
export { UserVaultInvestmentModel } from './UserVaultInvestment';
export { UserYieldInvestmentModel } from './UserYieldInvestment';
export { ReportModel } from './Report';
export { UserAchievementModel } from './UserAchievement';
export { PortfolioSnapshotModel } from './PortfolioSnapshot';
export { LedgerEntryModel } from './LedgerEntry';
export { AdminAuditLogModel } from './AdminAuditLog';
export { RateLimitBucketModel } from './RateLimitBucket';
export { NotificationModel } from './Notification';
export { DepositAddressModel } from './DepositAddress';
export { AdminUserModel } from './AdminUser';
export { AdminSessionModel } from './AdminSession';
export { DepositModel } from './Deposit';
export { SupportTicketModel, ticketReference } from './SupportTicket';
export type { ILedgerEntry, LedgerEntryType } from './LedgerEntry';
export type { INotification, NotificationType } from './Notification';
export type { IAdminUser } from './AdminUser';
export type { IDeposit, DepositStatus } from './Deposit';
export type { ISupportTicket, SupportTicketStatus } from './SupportTicket';
export type { AuditTargetType } from './AdminAuditLog';

// Import User model from mongo.ts
import { getUserModel } from '../mongo';
export { getUserModel };
