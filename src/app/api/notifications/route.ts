import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { connectToDatabase } from '@/lib/mongo';
import { NotificationModel } from '@/lib/models/Notification';

/**
 * The account holder's own notifications. Scoped to the session's user id on
 * every query - there is no id parameter to tamper with, and no admin variant
 * of this route, because nothing about it is administrative.
 */

/**
 * Enough to cover a long absence without turning the bell into an unbounded
 * scroll. Older entries stay in the database; the panel simply does not
 * render them, and the achievements page remains the durable record.
 */
const PAGE_SIZE = 30;

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  // Counted rather than derived from the page above it: with 40 unread the
  // badge must say 40, not the 30 that happen to have been fetched.
  const [items, unreadCount] = await Promise.all([
    NotificationModel.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE)
      .lean(),
    NotificationModel.countDocuments({ userId: session.user.id, readAt: null }),
  ]);

  return NextResponse.json({
    unreadCount,
    notifications: items.map((item) => ({
      id: item._id.toString(),
      type: item.type,
      title: item.title,
      body: item.body,
      href: item.href || null,
      read: !!item.readAt,
      createdAt: item.createdAt,
    })),
  });
}

/**
 * PATCH /api/notifications - Marks notifications read.
 *
 * Body may carry `ids` to mark specific entries, or nothing at all to mark
 * every unread one. Both filter on userId, so an id belonging to someone else
 * matches nothing rather than being updated.
 */
export async function PATCH(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connection = await connectToDatabase();
  if (!connection) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  let ids: string[] | null = null;
  try {
    const body = await request.json();
    if (Array.isArray(body?.ids)) {
      // A malformed id makes Mongoose throw on cast rather than return
      // nothing, which would turn a stale client into a 500.
      ids = body.ids.filter(
        (id: unknown) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)
      );
    }
  } catch {
    // No body means "all of them", which is what the panel sends when it opens.
  }

  const filter: Record<string, unknown> = { userId: session.user.id, readAt: null };
  if (ids) {
    if (ids.length === 0) return NextResponse.json({ updated: 0 });
    filter._id = { $in: ids };
  }

  const result = await NotificationModel.updateMany(filter, { $set: { readAt: new Date() } });

  return NextResponse.json({ updated: result.modifiedCount });
}
