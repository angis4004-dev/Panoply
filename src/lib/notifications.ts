import { connectToDatabase } from '@/lib/mongo';
import { NotificationModel, type NotificationType } from '@/lib/models/Notification';

/**
 * The one way anything in the application tells a user something happened.
 *
 * Callers are business operations - granting an achievement, approving a KYC
 * application, changing a PIN - and none of them should fail because the
 * announcement failed. The same trade-off the audit log makes, for the same
 * reason: the thing already happened, and turning a successful PIN change into
 * a 500 would misreport it far more damagingly than a missing bell entry.
 */

export interface NotificationSpec {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path only. Anything not starting with '/' is dropped. */
  href?: string;
  /** Supply only when the underlying fact can occur exactly once. */
  dedupeKey?: string;
}

export async function createNotification(spec: NotificationSpec): Promise<void> {
  try {
    const connection = await connectToDatabase();
    if (!connection) return;

    // href is rendered as a link the user will click while authenticated.
    // Every caller today passes a literal, but the guard keeps that true:
    // an absolute URL reaching this field would turn the notification panel
    // into somewhere an off-site link can be planted.
    const href = spec.href?.startsWith('/') && !spec.href.startsWith('//') ? spec.href : undefined;

    await NotificationModel.create({
      userId: spec.userId,
      type: spec.type,
      title: spec.title,
      body: spec.body,
      href,
      dedupeKey: spec.dedupeKey,
    });
  } catch (error) {
    // A duplicate key is the dedupe index doing its job, not a failure -
    // something already announced this. Anything else is worth seeing.
    if (isDuplicateKeyError(error)) return;
    console.error('Failed to write notification:', spec.type, spec.title, error);
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * Security events the account holder is told about whether or not they were
 * the one who caused them.
 *
 * That is the entire point. Someone who did change their own PIN learns
 * nothing new; someone who did not has just been handed the only signal the
 * product can give them that their account is in someone else's hands. The
 * message therefore names the action plainly and does not congratulate.
 */
export async function notifySecurityEvent(
  userId: string,
  title: string,
  body: string
): Promise<void> {
  await createNotification({
    userId,
    type: 'security',
    title,
    body,
    href: '/dashboard/settings',
  });
}
