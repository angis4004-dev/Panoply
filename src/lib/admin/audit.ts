import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongo';
import { AdminAuditLogModel, type AuditTargetType } from '@/lib/models/AdminAuditLog';
import type { AdminRequestContext } from './guard';

/**
 * Records administrative actions, attributed to the admin account and session
 * that took them.
 *
 * See src/lib/models/AdminAuditLog.ts for why this exists separately from the
 * ledger. What this file adds over the version it replaces is the actor: the
 * old one read a trader session and wrote a User id, which is no longer what
 * an admin is.
 */

/** Fields never written to the audit trail, whatever a caller passes. */
const REDACTED_FIELDS = new Set([
  'passwordHash',
  'pinHash',
  'kycIdNumber',
  'kycDocumentData',
  'resetPasswordToken',
  'emailVerificationToken',
  'tokenHash',
]);

/**
 * Reduces a before/after pair to only what actually changed.
 *
 * Recording the whole document on every edit would turn the audit log into a
 * second copy of the user table - including the PII that is encrypted at rest
 * precisely so it is not lying around in a second collection. A diff keeps it
 * to the facts under review.
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

export interface AdminAuditSpec {
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  /** The trader ultimately affected, when the target is not the trader. */
  affectedUserId?: string | mongoose.Types.ObjectId | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  /** Transaction hash, deposit id, or whatever identifies the evidence. */
  reference?: string;
  /** Set when writing inside a transaction that must include the audit entry. */
  session?: mongoose.ClientSession;
}

/**
 * Writes one audit entry.
 *
 * Never throws, with one exception: when a caller passes a `session`, the
 * write is part of a transaction the caller is coordinating, and swallowing a
 * failure there would commit a money movement whose audit entry silently did
 * not happen. Outside a transaction the trade-off runs the other way - the
 * action already succeeded, and failing the request would misreport it. A gap
 * in the trail is recoverable from application logs; a false error message is
 * not.
 */
export async function recordAdminAction(
  ctx: AdminRequestContext,
  spec: AdminAuditSpec
): Promise<boolean> {
  const write = async () => {
    const connection = await connectToDatabase();
    if (!connection) return false;

    const { before, after } = diffFields(spec.before ?? {}, spec.after ?? {});

    const doc = {
      actorAdminId: ctx.admin.id,
      actorEmail: ctx.admin.email,
      actorRole: ctx.admin.role,
      action: spec.action,
      targetType: spec.targetType,
      targetId: spec.targetId,
      affectedUserId: spec.affectedUserId ?? null,
      before,
      after,
      reason: spec.reason ?? '',
      reference: spec.reference ?? '',
      ip: ctx.ip,
      userAgent: ctx.userAgent.slice(0, 400),
      sessionId: ctx.sessionId,
    };

    if (spec.session) {
      await AdminAuditLogModel.create([doc], { session: spec.session });
    } else {
      await AdminAuditLogModel.create(doc);
    }
    return true;
  };

  if (spec.session) {
    // Inside a transaction: let it fail the transaction.
    return write();
  }

  try {
    return await write();
  } catch (error) {
    console.error('Failed to write admin audit entry:', spec.action, error);
    return false;
  }
}
