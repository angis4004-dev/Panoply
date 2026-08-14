import { connectToDatabase } from '@/lib/mongo';
import { NotificationModel, type NotificationType } from '@/lib/models/Notification';
import { UserModel } from '@/lib/models/user';

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

/**
 * Tell every trader the same thing.
 *
 * For facts about the platform rather than about one account - a deposit
 * address being published, withdrawn, or rotated. Rotation is the case that
 * justifies the fan-out: a trader who saved the old address will keep sending
 * to it, and the only way to stop that is to reach all of them.
 *
 * One insertMany rather than N creates, unordered so a single row colliding on
 * the dedupe index does not abandon the rest of the broadcast. Like
 * createNotification, it never throws: the address change already happened.
 *
 * Returns how many were written, which the caller may log but should not gate
 * anything on.
 */
export async function broadcastToTraders(spec: Omit<NotificationSpec, 'userId'>): Promise<number> {
  try {
    const connection = await connectToDatabase();
    if (!connection) return 0;

    const href = spec.href?.startsWith('/') && !spec.href.startsWith('//') ? spec.href : undefined;

    // Suspended accounts are excluded: they cannot deposit, so a deposit
    // notice is noise, and it is the one message that reads as an invitation.
    const traders = await UserModel.find({ role: 'Trader', status: { $ne: 'suspended' } })
      .select('_id')
      .lean();
    if (traders.length === 0) return 0;

    const rows = traders.map((trader) => ({
      userId: trader._id,
      type: spec.type,
      title: spec.title,
      body: spec.body,
      href,
      // Per recipient, or the unique index would let exactly one trader in the
      // whole broadcast receive it.
      dedupeKey: spec.dedupeKey ? `${spec.dedupeKey}:${String(trader._id)}` : undefined,
    }));

    // Unordered so one row colliding on the dedupe index does not abandon the
    // recipients after it.
    const written = await NotificationModel.insertMany(rows, { ordered: false });
    return written.length;
  } catch (error) {
    if (isDuplicateKeyError(error)) return 0;
    console.error('Failed to broadcast notification:', spec.type, spec.title, error);
    return 0;
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
