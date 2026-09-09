import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { parseBody } from '@/lib/validation';
import { consumeAttempt, formatRetryAfter } from '@/lib/rate-limit';
import {
  createSupportTicket,
  ticketRateLimitKey,
  TICKET_RATE_LIMIT,
  TICKET_RATE_WINDOW_MS,
} from '@/lib/support';

/**
 * POST /api/support/tickets — reach a person.
 *
 * Deliberately not tier-gated. Ask Panoply's monthly allowance is zero for an
 * unverified account, so gating this the same way would leave the users most
 * likely to be stuck - mid-verification, unable to deposit - with no channel
 * at all. Signed in and past the PIN is the whole requirement.
 */

const requestSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(4000),
  /** Where they were when they gave up. Optional; the ticket is valid without it. */
  pathname: z.string().max(200).optional(),
  /** The last thing they asked the assistant, when escalating from a chat. */
  lastQuestion: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const locked = requireUnlock(request, session);
    if (locked) return locked;

    const { data: body, error: invalid } = await parseBody(request, requestSchema);
    if (invalid) return invalid;

    const spent = await consumeAttempt(
      ticketRateLimitKey(session.user.id),
      TICKET_RATE_LIMIT,
      TICKET_RATE_WINDOW_MS
    );
    if (spent.limited) {
      return NextResponse.json(
        {
          error: `You have opened ${TICKET_RATE_LIMIT} tickets recently. Try again in ${formatRetryAfter(spent.retryAfterMs)} — or reply to the ticket you already have.`,
        },
        { status: 429 }
      );
    }

    const created = await createSupportTicket({
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name,
      subject: body.subject,
      body: body.body,
      pathname: body.pathname,
      lastQuestion: body.lastQuestion,
    });

    if (!created) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    return NextResponse.json({ reference: created.reference }, { status: 201 });
  } catch (error) {
    console.error(
      '[support] ticket creation failed:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: 'We could not open your ticket just now. Please try again.' },
      { status: 500 }
    );
  }
}
