import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingBotModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { withLedger } from '@/lib/ledger';
import { toDollars, toMinor } from '@/lib/money';
import { liquidateFlow } from '@/lib/exchange/execution';
import { computeFlowPnl } from '@/lib/exchange/pnl';
import { formatPnlPercent } from '@/lib/exchange/position';
import { toMinorUnits } from '@/lib/exchange/types';
import { objectId, parseBody, updateBotSchema } from '@/lib/validation';

// PATCH /api/bots/[id] - Update a bot the logged-in user owns (e.g. toggle status)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const locked = requireUnlock(request, session);
    if (locked) return locked;

    const { id } = await params;
    if (!objectId.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid bot id' }, { status: 400 });
    }

    const { data: body, error: invalid } = await parseBody(request, updateBotSchema);
    if (invalid) return invalid;

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const bot = await TradingBotModel.findById(id);
    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    if (bot.userId.toString() !== session.user.id && session.user.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (body.status) {
      /*
       * Resuming clears the last cycle note, which otherwise leaves "Flow is
       * paused; no action taken." on screen until the scheduler next runs -
       * reading as though the resume had not taken effect.
       *
       * lastCycleAt is deliberately left alone. It is the scheduler's fairness
       * key, and resetting it on resume would send a flow to the back of the
       * queue every time it was toggled.
       */
      if (body.status === 'running' && bot.status !== 'running') {
        bot.lastCycleReason = 'Resumed; waiting for the next scheduled cycle.';
      }
      bot.status = body.status;
    }

    if (body.confidence !== undefined) {
      bot.confidence = body.confidence;
    }

    await bot.save();

    return NextResponse.json({
      id: bot._id.toString(),
      type: bot.type,
      pair: bot.pair,
      confidence: bot.confidence,
      status: bot.status,
      pnl: bot.pnl || '+0.0%',
      allocatedAmount: bot.allocatedAmount ?? null,
    });
  } catch (error) {
    console.error('Error updating bot:', error);
    return NextResponse.json({ error: 'Failed to update bot' }, { status: 500 });
  }
}

/**
 * Raised when another request has already deleted and settled this flow.
 *
 * Not an error the trader caused - it is what the second and third click of a
 * double-click look like from the server. It aborts the transaction, which is
 * the point: no row, no payout.
 */
class AlreadySettledError extends Error {
  constructor() {
    super('Flow already settled');
    this.name = 'AlreadySettledError';
  }
}

// DELETE /api/bots/[id] - Remove a bot the logged-in user owns
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const locked = requireUnlock(request, session);
    if (locked) return locked;

    const { id } = await params;

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const bot = await TradingBotModel.findById(id);
    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    if (bot.userId.toString() !== session.user.id && session.user.role !== 'Admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const releaseMinor = bot.allocatedAmount ? toMinor(bot.allocatedAmount) : 0;

    /*
     * Liquidate before settling.
     *
     * A flow holding an open position has unrealized P&L, and unrealized P&L
     * is not money - it is a price the market is quoting today. Paying it out
     * would mean crediting a figure the platform has not received, so the
     * position is sold first and only what the sale actually realized is
     * settled.
     *
     * If the sale fails the close is abandoned rather than settled on an
     * estimate. Better a flow the trader has to close again than a payout
     * against an asset the platform still holds.
     */
    const liquidation = await liquidateFlow(String(bot._id));
    if (!liquidation.ok) {
      return NextResponse.json(
        {
          error: `Could not close the position before settling: ${liquidation.reason} Nothing was changed - try again shortly.`,
        },
        { status: 409 }
      );
    }

    // Recomputed after the liquidation so the sale's own fills are included.
    const finalPnl = await computeFlowPnl(bot._id, bot.pair, bot.allocatedAmount ?? 0);
    const finalPnlPercent = finalPnl.valuation.pnlPercent ?? 0;

    /*
     * Realized only. Anything still unrealized at this point means the
     * liquidation did not fully close - which liquidateFlow refuses to return
     * ok for - so in practice this is the whole result.
     */
    const rawPnlMinor = toMinorUnits(finalPnl.valuation.realizedPnl);

    // A flow cannot lose more than was committed to it. Clamping here rather
    // than relying on the ledger's insufficient-funds guard keeps the failure
    // out of the close path entirely: a flow deep enough underwater to
    // overdraw would otherwise become impossible to close.
    const settlementMinor = Math.max(rawPnlMinor, -releaseMinor);

    // Deletion, principal, and realized result commit together, so a flow can
    // never disappear without both legs of the money following it.
    try {
      await withLedger(async (tx) => {
        /*
         * The delete is the lock, and its result is the permission to pay.
         *
         * The findById above runs outside this transaction, so concurrent
         * requests for the same flow all see it and all reach this point. That
         * is not hypothetical: a trader triple-clicking Close sent three
         * DELETEs a second apart, and because this line's result was discarded
         * all three went on to post a release - $500 of principal paid out as
         * $1,500. The two extra $1,000 were created from nothing.
         *
         * deletedCount is 1 for exactly one of those requests. The others lost
         * the race, which means another transaction has already settled this
         * flow, and the only correct thing left to do is pay nothing and abort.
         */
        const removed = await TradingBotModel.deleteOne({ _id: bot._id }).session(tx.session);
        if (removed.deletedCount === 0) {
          throw new AlreadySettledError();
        }

        if (releaseMinor > 0) {
          await tx.post({
            userId: bot.userId,
            type: 'release',
            amountMinor: releaseMinor,
            relatedEntityType: 'bot',
            relatedEntityId: bot._id,
            /*
             * Keyed on the flow, not on a client-supplied token, because the
             * thing that must happen once is "this flow's principal is
             * returned" - and the flow id is the only identifier every retry
             * of that act agrees on. The ledger's unique index then makes a
             * second release impossible even if the guard above is ever
             * defeated by a path nobody has thought of yet.
             */
            idempotencyKey: `bot-release:${bot._id}`,
            memo: `Principal released from ${bot.type} ${bot.pair}`,
          });
        }

        // Posted as its own entry rather than folded into the release. The
        // ledger should show what was committed and what the strategy made or
        // lost as two separate facts - netting them makes a losing flow
        // indistinguishable from a smaller winning one.
        if (settlementMinor !== 0) {
          await tx.post({
            userId: bot.userId,
            type: 'settlement',
            amountMinor: settlementMinor,
            relatedEntityType: 'bot',
            relatedEntityId: bot._id,
            idempotencyKey: `bot-settle:${bot._id}`,
            memo: `Realized ${formatPnlPercent(finalPnl.valuation.pnlPercent)} on ${bot.type} ${bot.pair}`,
          });
        }
      });
    } catch (error) {
      if (error instanceof AlreadySettledError) {
        return NextResponse.json(
          { error: 'This flow has already been closed. Nothing further was paid out.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      releasedAmount: toDollars(releaseMinor),
      realizedPnl: toDollars(settlementMinor),
      realizedPnlPercent: finalPnlPercent,
    });
  } catch (error) {
    console.error('Error deleting bot:', error);
    return NextResponse.json({ error: 'Failed to delete bot' }, { status: 500 });
  }
}
