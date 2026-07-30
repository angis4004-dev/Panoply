import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingBotModel, getUserModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { getCoinPrices } from '@/lib/coingecko';
import { resolveBaseCoinId } from '@/lib/coin-symbols';
import { applyPendingTicks, formatPnl } from '@/lib/bot-pnl';
import { computeTier, grantAchievement, TIER_SLOT_LIMITS } from '@/lib/achievements/engine';

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
        };
      })
    );

    return NextResponse.json(results);
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

    // Parse request body
    const body = await request.json();

    // Validate required fields
    const requiredFields = ['type', 'pair', 'confidence', 'status', 'allocatedAmount'];
    for (const field of requiredFields) {
      if (!(field in body)) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    const allocatedAmount = Number(body.allocatedAmount);
    if (!Number.isFinite(allocatedAmount) || allocatedAmount <= 0) {
      return NextResponse.json(
        { error: 'allocatedAmount must be a positive number' },
        { status: 400 }
      );
    }

    // Validate enum values
    const validTypes = ['Grid', 'DCA', 'Arbitrage', 'Trailing Stop'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const validStatuses = ['running', 'paused', 'fallback'];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate confidence range
    if (body.confidence < 0 || body.confidence > 100) {
      return NextResponse.json({ error: 'Confidence must be between 0 and 100' }, { status: 400 });
    }

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

    const debited = await userModel.findOneAndUpdate(
      { _id: userId, walletBalance: { $gte: allocatedAmount } },
      { $inc: { walletBalance: -allocatedAmount } }
    );
    if (!debited) {
      return NextResponse.json(
        { error: 'Insufficient wallet balance. Deposit more funds before allocating capital.' },
        { status: 400 }
      );
    }

    try {
      // Resolve the base asset to a live CoinGecko price so P&L can be tracked
      // against real market movement from this point forward. Pairs we don't
      // recognize fall back to the static placeholder pnl.
      const pair = body.pair.toUpperCase();
      const coinId = resolveBaseCoinId(pair);
      let entryPrice: number | null = null;
      if (coinId) {
        const prices = await getCoinPrices([coinId]);
        entryPrice = prices[coinId]?.usd || null;
      }

      // Create new bot for the user
      const newBot = new TradingBotModel({
        type: body.type,
        pair, // Ensure pair is uppercase
        userId, // Reference to the User
        confidence: body.confidence,
        status: body.status,
        pnl: body.pnl || '+0.0%',
        coinId: entryPrice ? coinId : null,
        entryPrice,
        allocatedAmount,
      });

      const savedBot = await newBot.save();

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
    } catch (creationError) {
      // The wallet was already debited - refund it since no bot was created.
      await userModel.findByIdAndUpdate(userId, { $inc: { walletBalance: allocatedAmount } });
      throw creationError;
    }
  } catch (error) {
    console.error('Error creating bot:', error);
    return NextResponse.json({ error: 'Failed to create bot' }, { status: 500 });
  }
}
