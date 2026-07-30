import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingBotModel, getUserModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';

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

    await bot.deleteOne();

    // Refund the allocated capital to the bot owner's wallet balance now that
    // it's no longer tied up in this signal flow.
    if (bot.allocatedAmount) {
      const userModel = await getUserModel();
      if (userModel) {
        await userModel.findByIdAndUpdate(bot.userId, {
          $inc: { walletBalance: bot.allocatedAmount },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting bot:', error);
    return NextResponse.json({ error: 'Failed to delete bot' }, { status: 500 });
  }
}
