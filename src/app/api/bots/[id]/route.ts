import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingBotModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { withLedger } from '@/lib/ledger';
import { toDollars, toMinor } from '@/lib/money';
import { applyPendingTicks, formatPnl } from '@/lib/bot-pnl';

// PATCH /api/bots/[id] - Update a bot the logged-in user owns (e.g. toggle status)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

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
      const validStatuses = ['running', 'paused', 'fallback'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      // Resuming into 'running' resets the tick anchor to now. Without this,
      // a flow paused for hours would book one giant catch-up burst of ticks
      // the instant it resumes, since the earnings tick engine (bot-pnl.ts)
      // measures elapsed time since lastTickAt regardless of how it got so
      // large.
      if (body.status === 'running' && bot.status !== 'running') {
        bot.lastTickAt = new Date();
      }
      bot.status = body.status;
    }

    if (body.confidence !== undefined) {
      if (body.confidence < 0 || body.confidence > 100) {
        return NextResponse.json(
          { error: 'Confidence must be between 0 and 100' },
          { status: 400 }
        );
      }
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

    // Ticks are brought up to now before closing. simulatedPnlPercent is only
    // as fresh as the last read of this flow, so settling the stored value
    // would pay out a figure from whenever the owner last opened the
    // dashboard rather than the one in force at the moment they closed.
    const finalTick = applyPendingTicks({
      id: bot._id.toString(),
      status: bot.status,
      confidence: bot.confidence,
      simulatedPnlPercent: bot.simulatedPnlPercent ?? 0,
      lastTickAt: bot.lastTickAt ?? bot.createdAt,
    });
    const finalPnlPercent = finalTick.simulatedPnlPercent;

    // A flow cannot lose more than was committed to it. Clamping here rather
    // than relying on the ledger's insufficient-funds guard keeps the failure
    // out of the close path entirely: a flow deep enough underwater to
    // overdraw would otherwise become impossible to close.
    const rawPnlMinor = Math.round((releaseMinor * finalPnlPercent) / 100);
    const settlementMinor = Math.max(rawPnlMinor, -releaseMinor);

    // Deletion, principal, and realized result commit together, so a flow can
    // never disappear without both legs of the money following it.
    await withLedger(async (tx) => {
      await TradingBotModel.deleteOne({ _id: bot._id }).session(tx.session);

      if (releaseMinor > 0) {
        await tx.post({
          userId: bot.userId,
          type: 'release',
          amountMinor: releaseMinor,
          relatedEntityType: 'bot',
          relatedEntityId: bot._id,
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
          memo: `Realized ${formatPnl(finalPnlPercent)} on ${bot.type} ${bot.pair}`,
        });
      }
    });

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
