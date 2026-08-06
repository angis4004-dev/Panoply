import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingBotModel, getUserModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { getCoinPrices } from '@/lib/coingecko';
import { resolveBaseCoinId } from '@/lib/coin-symbols';
import { applyPendingTicks, formatPnl } from '@/lib/bot-pnl';
import { recordSnapshotIfDue } from '@/lib/portfolio-snapshot';
import { computeTier, grantAchievement, TIER_SLOT_LIMITS } from '@/lib/achievements/engine';
import { InsufficientFundsError, withLedger } from '@/lib/ledger';
import { InvalidAmountError, toDollars, toPositiveMinor } from '@/lib/money';
import { createBotSchema, parseBody } from '@/lib/validation';

// GET /api/bots - Returns ONLY the bots belonging to the currently logged-in user
export async function GET(request: NextRequest) {
  try {
    // Get session to identify the current user
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Find bots for the specific user
    const bots = await TradingBotModel.find({ userId }).lean();

    // Catch up each running bot's simulated P&L to now, persisting only the
    // ones that actually crossed a 30s tick boundary since last read.
    const now = new Date();
    const results = await Promise.all(
      bots.map(async (bot) => {
        const tick = applyPendingTicks(
          {
            id: bot._id.toString(),
            status: bot.status,
            confidence: bot.confidence,
            simulatedPnlPercent: bot.simulatedPnlPercent ?? 0,
            lastTickAt: bot.lastTickAt ?? bot.createdAt,
          },
          now
        );

        if (tick.ticksApplied > 0) {
          await TradingBotModel.findByIdAndUpdate(bot._id, {
            simulatedPnlPercent: tick.simulatedPnlPercent,
            lastTickAt: tick.lastTickAt,
          });
        }

        return {
          id: bot._id.toString(),
          type: bot.type,
          pair: bot.pair,
          confidence: bot.confidence,
          status: bot.status,
          pnl: formatPnl(tick.simulatedPnlPercent),
          allocatedAmount: bot.allocatedAmount ?? null,
          pnlDollar: (bot.allocatedAmount ?? 0) * (tick.simulatedPnlPercent / 100),
        };
      })
    );

    // Feeds the dashboard's "Cumulative P&L" chart. Excludes wallet
    // balance on purpose - deposits/withdrawals are capital movements, not
    // profit or loss, and this total is defined to match the "Realized
    // P&L" figure on the metrics grid exactly (both sum allocatedAmount *
    // pnlPercent/100 across the same bots).
    const totalPnlDollar = results.reduce((sum, bot) => sum + bot.pnlDollar, 0);
    await recordSnapshotIfDue(userId, totalPnlDollar);

    const formattedBots = results.map(({ pnlDollar: _pnlDollar, ...bot }) => bot);
    return NextResponse.json(formattedBots);
  } catch (error) {
    console.error('Error fetching user bots:', error);
    return NextResponse.json({ error: 'Failed to fetch bots' }, { status: 500 });
  }
}

// POST /api/bots - Allows the logged-in user to create their own bot
export async function POST(request: NextRequest) {
  try {
    // Get session to identify the current user
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Shape, types, enums and ranges are all described once in
    // createBotSchema; only the cent conversion is left to do here.
    const { data: body, error: invalid } = await parseBody(request, createBotSchema);
    if (invalid) return invalid;

    let allocatedMinor: number;
    try {
      allocatedMinor = toPositiveMinor(body.allocatedAmount);
    } catch (error) {
      if (error instanceof InvalidAmountError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
    // Position size stays in dollars on the bot because the P&L engine works in
    // percentages against it; deriving it from the minor amount keeps it exact
    // to the cent rather than trusting whatever precision the client sent.
    const allocatedAmount = toDollars(allocatedMinor);

    // Get userId from session (now properly authenticated)
    const userId = session.user.id;

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Atomically debit the wallet balance, guarded by $gte so concurrent
    // requests can't over-allocate more capital than is actually available.
    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Computed live from kycStatus/lifetimeDeposited rather than trusting the
    // cached `tier` field: accounts created before this field existed have no
    // `tier` in their raw Mongo document (Mongoose .lean() does not backfill
    // schema defaults for missing fields), so trusting a stored `tier` would
    // wrongly gate already-verified legacy users as unverified.
    const currentUser = await userModel
      .findById(userId)
      .select('kycStatus lifetimeDeposited')
      .lean();
    const userTier = computeTier(
      currentUser?.kycStatus || 'unverified',
      currentUser?.lifetimeDeposited || 0
    );
    const slotLimit = TIER_SLOT_LIMITS[userTier];

    if (slotLimit === 0) {
      return NextResponse.json(
        { error: 'Complete identity verification to activate signal flows.' },
        { status: 403 }
      );
    }

    const activeBotCount = await TradingBotModel.countDocuments({ userId });
    if (activeBotCount >= slotLimit) {
      return NextResponse.json(
        {
          error: `Your ${userTier} tier allows up to ${slotLimit} signal flow(s). Upgrade your tier to activate more.`,
        },
        { status: 403 }
      );
    }

    // Resolved before the transaction opens: this is an outbound HTTP call, and
    // holding a transaction across the network would both extend lock duration
    // and re-issue the request on every write-conflict retry.
    const pair = body.pair.toUpperCase();
    const coinId = resolveBaseCoinId(pair);
    let entryPrice: number | null = null;
    if (coinId) {
      const prices = await getCoinPrices([coinId]);
      entryPrice = prices[coinId]?.usd || null;
    }

    // Namespaced per operation so the same client-generated key used against
    // two different endpoints cannot collide on the ledger's unique index.
    const idempotencyKey = request.headers.get('idempotency-key') ?? undefined;

    let savedBot;
    try {
      // The flow and the debit that funds it commit together or not at all.
      // The previous version debited first and refunded in a catch, which left
      // the user short whenever the process died in between.
      savedBot = await withLedger(async (tx) => {
        const [bot] = await TradingBotModel.create(
          [
            {
              type: body.type,
              pair,
              userId,
              confidence: body.confidence,
              status: body.status,
              pnl: body.pnl || '+0.0%',
              coinId: entryPrice ? coinId : null,
              entryPrice,
              allocatedAmount,
            },
          ],
          { session: tx.session }
        );

        await tx.post({
          userId,
          type: 'allocation',
          amountMinor: -allocatedMinor,
          relatedEntityType: 'bot',
          relatedEntityId: bot._id,
          idempotencyKey: idempotencyKey ? `bot-alloc:${idempotencyKey}` : undefined,
          memo: `Allocation to ${body.type} ${pair}`,
        });

        return bot;
      });
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        return NextResponse.json(
          { error: 'Insufficient wallet balance. Deposit more funds before allocating capital.' },
          { status: 400 }
        );
      }
      throw error;
    }

    // Achievements are a cosmetic side effect of a flow that is already
    // committed. A failure here must not fail the request and must certainly
    // not reverse the allocation, so it is logged and swallowed.
    try {
      await grantAchievement(userId, 'first_strategy_activated');

      await userModel.findByIdAndUpdate(userId, {
        $addToSet: { distinctBotStrategyTypes: body.type },
      });
      const updatedUser = await userModel
        .findById(userId)
        .select('distinctBotStrategyTypes')
        .lean();
      if (updatedUser && updatedUser.distinctBotStrategyTypes.length >= 2) {
        await grantAchievement(userId, 'strategy_builder');
      }
    } catch (achievementError) {
      console.error('Error granting achievements after bot creation:', achievementError);
    }

    // Return the created bot in frontend format
    return NextResponse.json(
      {
        id: savedBot._id.toString(),
        type: savedBot.type,
        pair: savedBot.pair,
        confidence: savedBot.confidence,
        status: savedBot.status,
        pnl: savedBot.pnl || '+0.0%',
        allocatedAmount: savedBot.allocatedAmount,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating bot:', error);
    return NextResponse.json({ error: 'Failed to create bot' }, { status: 500 });
  }
}
