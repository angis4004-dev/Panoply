import { AdminUserModel } from '@/lib/models/AdminUser';
import { connectToDatabase } from '@/lib/mongo';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { hasPermission, type AdminPrincipal } from '@/lib/admin/permissions';

/**
 * Who hears that a KYC submission is waiting.
 *
 * The operations inbox always, and every delegate admin who can actually
 * approve one. Addressing the queue to the people who work it is the point:
 * an alert that only reaches the owner's inbox is a queue that stalls
 * whenever the owner is away.
 *
 * The main admin is deliberately left out. They hold every permission by
 * role, so including "whoever can approve" would mean them on every
 * submission, which is the opposite of delegating the work. They still see
 * the queue in the console, and the operations inbox is theirs too.
 *
 * Read from the console rather than from configuration, so the list follows
 * the accounts: grant an admin their access and the alerts start arriving,
 * suspend them and they stop. `effectivePermissions` decides, which is the
 * same function the console uses to decide whether the approve button works
 * at all - a list built from a different rule would eventually address
 * someone who cannot act.
 */

/** Active delegate admins who may approve a submission, lower-cased, deduped. */
export function selectKycReviewers(admins: AdminPrincipal[]): string[] {
  const emails = admins
    .filter((admin) => admin.role !== 'MainAdmin' && hasPermission(admin, 'kyc.review'))
    .map((admin) => admin.email.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(emails)];
}

/** The operations inbox, first, and never dropped. */
function opsInbox(): string {
  return (process.env.OPS_ALERT_EMAIL?.trim() || SUPPORT_EMAIL).toLowerCase();
}

/**
 * The recipients for a KYC alert.
 *
 * A database that cannot be read falls back to the operations inbox alone
 * rather than throwing: losing the reviewers' copy is bad, losing the alert
 * is worse.
 */
export async function kycAlertRecipients(): Promise<string[]> {
  const inbox = opsInbox();
  try {
    const connection = await connectToDatabase();
    if (!connection) return [inbox];

    const admins = await AdminUserModel.find({ status: 'active' })
      .select('email role status grantedPermissions')
      .lean();

    const reviewers = selectKycReviewers(
      admins.map((admin) => ({
        id: String(admin._id),
        email: admin.email,
        role: admin.role,
        status: admin.status,
        grantedPermissions: admin.grantedPermissions ?? [],
      }))
    );
    return [...new Set([inbox, ...reviewers])];
  } catch (error) {
    console.error(
      'Could not read the KYC reviewer list; alerting the operations inbox only:',
      error
    );
    return [inbox];
  }
}
