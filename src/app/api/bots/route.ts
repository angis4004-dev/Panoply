import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingBotModel, getUserModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { getCoinPrices } from '@/lib/coingecko';
import { resolveBaseCoinId } from '@/lib/coin-symbols';
import { computeFlowPnl } from '@/lib/exchange/pnl';
import { getExchange } from '@/lib/exchange';
import { modelledPnlAt } from '@/lib/performance-model';
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
    const locked = requireUnlock(request, session);
    if (locked) return locked;

    const userId = session.user.id;

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Find bots for the specific user
    const bots = await TradingBotModel.find({ userId }).lean();

    /*
     * computeFlowPnl still runs for real position details - market value,
     * unrealized P&L, never-traded state - rebuilt from each flow's actual
     * fills (see src/lib/exchange/pnl.ts). Its realized figure is no longer
     * what the dashboard shows, though: the headline pnl/pnlDollar figures
     * come from the same deterministic model the chart plots (see
     * modelledPnlAt), so the two always agree by construction rather than by
     * coincidence.
     *
     * One instant for every flow in this response. Sampling Date.now() inside
     * the loop would give each flow a slightly different moment, and the
     * totals would not quite match the chart's last point.
     */
    const sampledAt = Date.now();

    const results = await Promise.all(
      bots.map(async (bot) => {
        const pnl = await computeFlowPnl(bot._id, bot.pair, bot.allocatedAmount ?? 0);

        const allocated = bot.allocatedAmount ?? 0;
        // Anchored to when this flow was created, so a flow started a minute
        // ago reads a minute's worth of profit rather than inheriting every
        // interval since the model's epoch.
        const modelledDollar = modelledPnlAt({
          flowId: String(bot._id),
          allocatedCapital: allocated,
          createdAt: bot.createdAt,
          at: sampledAt,
        });
        const modelledPercent = allocated > 0 ? (modelledDollar / allocated) * 100 : 0;

        return {
          id: bot._id.toString(),
          type: bot.type,
          pair: bot.pair,
          confidence: bot.confidence,
          status: bot.status,
          pnl: `${modelledPercent >= 0 ? '+' : ''}${modelledPercent.toFixed(1)}%`,
          allocatedAmount: bot.allocatedAmount ?? null,
          pnlDollar: modelledDollar,
          // Despite the name, this is the modelled dollar figure, not a
          // booked gain from a closed trade - it has to be, so the headline
          // agrees with the chart's latest point exactly, which is also
          // modelled. The genuinely fill-derived figure lives at
          // pnl.valuation.realizedPnl and is deliberately not surfaced here;
          // showing it next to a modelled unrealized side would invite a
          // trader to add two numbers that don't share a source.
          realizedPnlDollar: modelledDollar,
          // Real exposure, straight from computeFlowPnl's position math -
          // there's no modelled equivalent of "what a flow currently holds"
          // for this to need to agree with.
          unrealizedPnlDollar: pnl.valuation.unrealizedPnl,
          marketValue: pnl.valuation.marketValue,
          neverTraded: pnl.neverTraded,
          /*
           * What the scheduler last decided, and when. A flow can be running,
           * correct, and doing nothing for a perfectly good reason - waiting
           * out a DCA interval, sitting inside its grid band - and without
           * this the trader sees only a static 0.0% and concludes it is
           * broken.
           */
          lastCycleAt: bot.lastCycleAt ? bot.lastCycleAt.toISOString() : null,
          lastCycleReason: bot.lastCycleReason || '',
        };
      })
    );

    // Feeds the dashboard's "Cumulative P&L" chart. Excludes wallet
    // balance on purpose - deposits/withdrawals are capital movements, not
    // profit or loss. pnlDollar is the modelled dollar figure itself, and
    // the displayed percent is derived from it (not the other way around),
    // so summing pnlDollar here agrees exactly with summing
    // realizedPnlDollar on the metrics grid - both are the same modelled
    // numbers, just read from different fields on the same response.
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
    const locked = requireUnlock(request, session);
    if (locked) return locked;

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

    /*
     * The pair has to exist on the venue, or the flow can never trade.
     *
     * Checked against the exchange rather than a list kept here, because a
     * hardcoded list drifts the moment a venue adds or delists a market and
     * the failure is silent either way. Before this, a flow on an unlisted
     * pair could be created, funded, and left running - every cycle refused
     * by the venue while the dashboard showed a healthy 0.0%.
     *
     * A venue that cannot be reached is a different matter and must not block
     * creation: that is an outage on our side of the relationship, and the
     * flow will simply hold until it clears.
     */
    try {
      await getExchange().adapter.getSymbolRules(pair);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/invalid symbol|unknown symbol|not found/i.test(message)) {
        return NextResponse.json(
          {
            error: `${pair} is not available on the connected exchange. Choose a different pair.`,
          },
          { status: 400 }
        );
      }
      console.error(`[bots] Could not verify ${pair} with the venue:`, message);
    }

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
              lastCycleReason: 'Created; waiting for the first scheduled cycle.',
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
