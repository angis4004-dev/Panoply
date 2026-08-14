import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { AdminAuditLogModel } from '@/lib/models/AdminAuditLog';
import { AdminUserModel } from '@/lib/models/AdminUser';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { auditQuerySchema } from '@/lib/admin/validation';

/**
 * The audit log, searchable.
 *
 * Read-only by construction - the collection refuses updates and deletes at
 * the schema level, and there is no write path here. An operations console
 * that can edit its own audit trail is not one.
 *
 * Every filter the requirements name maps to an index on the collection:
 * actor, affected trader, action, target type, reference, and a date range on
 * createdAt. Free-text search is deliberately absent; a regex scan over an
 * append-only collection that grows forever is a query that works in
 * development and times out in production.
 */
export async function GET(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'audit.read');
  if (!guard.ok) return guard.response;

  const parsed = auditQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return adminJson(
      { error: issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message },
      { status: 400 }
    );
  }
  const filters = parsed.data;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const query: Record<string, unknown> = {};
  if (filters.actorAdminId) query.actorAdminId = filters.actorAdminId;
  if (filters.affectedUserId) query.affectedUserId = filters.affectedUserId;
  if (filters.targetType) query.targetType = filters.targetType;
  if (filters.reference) query.reference = filters.reference;
  if (filters.action) {
    // Prefix match, anchored, so 'deposit.' selects the whole family without
    // becoming an unanchored scan.
    query.action = filters.action.includes('.')
      ? filters.action
      : new RegExp(`^${filters.action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`);
  }

  const range: Record<string, Date> = {};
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime())) range.$lte = to;
  if (Object.keys(range).length) query.createdAt = range;

  const [rows, total, actors] = await Promise.all([
    AdminAuditLogModel.find(query)
      .sort({ createdAt: -1 })
      .skip((filters.page - 1) * filters.pageSize)
      .limit(filters.pageSize)
      .lean(),
    AdminAuditLogModel.countDocuments(query),
    // The filter dropdown needs names, and there are few enough admins that
    // fetching all of them beats a lookup stage on every page of results.
    AdminUserModel.find({}).select('name email role').lean(),
  ]);

  return adminJson({
    entries: rows.map((entry) => ({
      id: String(entry._id),
      actorAdminId: entry.actorAdminId ? String(entry.actorAdminId) : null,
      actorEmail: entry.actorEmail,
      actorRole: entry.actorRole ?? '',
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      affectedUserId: entry.affectedUserId ? String(entry.affectedUserId) : null,
      before: entry.before,
      after: entry.after,
      reason: entry.reason ?? '',
      reference: entry.reference ?? '',
      ip: entry.ip ?? '',
      createdAt: entry.createdAt,
    })),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    actors: actors.map((admin) => ({
      id: String(admin._id),
      name: admin.name,
      email: admin.email,
      role: admin.role,
    })),
  });
}
