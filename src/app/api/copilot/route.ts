import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongo';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { parseBody } from '@/lib/validation';
import { consumeAttempt } from '@/lib/rate-limit';
import { ask } from '@/lib/copilot/service';
import { quotaKey, quotaResetsAt, COPILOT_TIER_QUOTA } from '@/lib/copilot/quota';
import { getAccountSnapshot } from '@/lib/copilot/tools';
import type { CopilotRefusal } from '@/lib/copilot/types';

/**
 * POST /api/copilot — the only route into the assistant.
 *
 * Text posts here. Voice, when it is built, transcribes and posts here too.
 * Deliberately not /api/text-ai plus /api/voice-ai: two routes would be two
 * sets of quota accounting, two prompt assemblies and two places for the
 * safety rules to drift apart.
 */

const requestSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })
    )
    .max(40)
    .default([]),
  mode: z.enum(['text', 'voice']).default('text'),
  context: z.object({ pathname: z.string().max(200).optional() }).optional(),
});

/** One sentence per refusal. No stack traces, no upstream text, ever. */
function describeRefusal(refusal: CopilotRefusal): { message: string; status: number } {
  switch (refusal.reason) {
    case 'unauthenticated':
      return { message: 'Please sign in again to use the Copilot.', status: 401 };
    case 'not_configured':
      return {
        message: 'The Copilot is not available yet. Please check back shortly.',
        status: 503,
      };
    case 'tier_ineligible':
      return {
        message:
          'Complete identity verification to start using Panoply Copilot. Your questions each month are set by your tier.',
        status: 403,
      };
    case 'quota_exhausted':
      return {
        message: `You have used all ${refusal.limit} of your Copilot questions this month. Your allowance resets on ${new Date(refusal.resetsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`,
        status: 429,
      };
    case 'empty_message':
      return { message: 'Please type a question first.', status: 400 };
    case 'upstream_failed':
    default:
      return {
        message: "I couldn't reach Panoply's assistant just now. Please try again.",
        status: 502,
      };
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // The Copilot reads balances, flows and verification status, so it sits
    // behind the same PIN gate as every other route that touches account data.
    const locked = requireUnlock(request, session);
    if (locked) return locked;

    const { data: body, error: invalid } = await parseBody(request, requestSchema);
    if (invalid) return invalid;

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const userId = session.user.id;

    /*
     * The quota is consumed before the model runs, not after.
     *
     * Counting on success would let a user replay a request that times out
     * late and take several answers from one allowance slot. A failed call
     * costing a question is the lesser problem, and the failure paths above
     * this line - unconfigured, ineligible - are all checked before anything
     * is spent.
     */
    const account = await getAccountSnapshot(userId);
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const limit = COPILOT_TIER_QUOTA[account.tier];
    let usedThisMonth = 0;

    if (limit !== null) {
      const spent = await consumeAttempt(quotaKey(userId), limit, monthWindowMs());
      if (spent.limited) {
        const { message, status } = describeRefusal({
          reason: limit === 0 ? 'tier_ineligible' : 'quota_exhausted',
          limit,
          resetsAt: quotaResetsAt().toISOString(),
          tier: account.tier,
        } as CopilotRefusal);
        return NextResponse.json(
          { error: message, remaining: 0, resetsAt: quotaResetsAt().toISOString() },
          { status }
        );
      }
      usedThisMonth = limit - spent.remaining - 1;
    }

    const result = await ask({
      userId,
      usedThisMonth,
      message: body.message,
      history: body.history,
      mode: body.mode,
      context: body.context,
    });

    if (!result.ok) {
      const { message, status } = describeRefusal(result.refusal);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(result.reply);
  } catch (error) {
    console.error('[copilot] request failed:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "I couldn't reach Panoply's assistant just now. Please try again." },
      { status: 500 }
    );
  }
}

/** Milliseconds until the allowance resets, so the bucket expires with the month. */
function monthWindowMs(): number {
  return Math.max(60_000, quotaResetsAt().getTime() - Date.now());
}
