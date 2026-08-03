import { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { connectToDatabase } from '@/lib/mongo';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { getClientIp } from '@/lib/rate-limit';

/**
 * Records administrative actions. See src/lib/models/AdminAuditLog.ts for why
 * this exists separately from the ledger.
 */

/** Fields never written to the audit trail, whatever a caller passes. */
const REDACTED_FIELDS = new Set([
  'passwordHash',
  'kycIdNumber',
  'resetPasswordToken',
  'emailVerificationToken',
]);

/**
 * Reduces a before/after pair to only what actually changed.
 *
 * Recording the whole document on every edit would turn the audit log into a
 * second copy of the user table - including the PII the previous commit went
 * to some trouble to encrypt. A diff keeps it to the facts under review.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  for (const key of Object.keys(after)) {
    if (REDACTED_FIELDS.has(key)) continue;
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changedBefore[key] = from ?? null;
    changedAfter[key] = to ?? null;
  }

  return { before: changedBefore, after: changedAfter };
}

export interface AuditSpec {
  action: string;
  targetType: 'user' | 'bot' | 'kyc' | 'model';
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
}

/**
 * Writes one audit entry, attributing it to the admin making the request.
 *
 * Never throws. An audit write that fails should be loud in the logs but must
 * not turn a successful administrative action into an error response - the
 * action already happened, and failing the request would misreport it. The
 * trade-off is accepted deliberately: a gap in the trail is recoverable from
 * application logs, a false error message is not.
 */
export async function recordAdminAction(request: NextRequest, spec: AuditSpec): Promise<void> {
  try {
    const connection = await connectToDatabase();
    if (!connection) return;

    const session = await getSessionFromRequest(request);
    if (!session) return;

    const { before, after } = diffFields(spec.before ?? {}, spec.after ?? {});

    await AdminAuditLogModel.create({
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      action: spec.action,
      targetType: spec.targetType,
      targetId: spec.targetId,
      before,
      after,
      reason: spec.reason ?? '',
      ip: getClientIp(request),
    });
  } catch (error) {
    console.error('Failed to write admin audit entry:', spec.action, error);
  }
}
