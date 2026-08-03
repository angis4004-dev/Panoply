import { NextRequest, NextResponse } from 'next/server';
import { getUserModel, connectToDatabase } from '@/lib/mongo';
import { TradingBotModel } from '@/lib/models/TradingBot';
import { verifyAdminAccess } from '@/lib/auth-middleware';
import { recordAdminAction } from '@/lib/audit-log';

interface PopulatedUserRef {
  name?: string;
  email?: string;
}

export async function GET(request: NextRequest) {
  // Verify admin access
  const authResponse = await verifyAdminAccess(request);
  if (authResponse) return authResponse;

  try {
    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Populate user references to get user names
    const bots = await TradingBotModel.find().populate('userId', 'name email').lean();

    // Transform to match frontend format
    const formattedBots = bots.map((bot) => ({
      id: bot._id.toString(),
      type: bot.type,
      pair: bot.pair,
      user: bot.userId
        ? (bot.userId as unknown as PopulatedUserRef).name ||
          (bot.userId as unknown as PopulatedUserRef).email
        : 'Unknown',
      confidence: bot.confidence,
      status: bot.status,
      pnl: bot.pnl || '+0.0%',
      allocatedAmount: bot.allocatedAmount ?? null,
    }));

    return NextResponse.json(formattedBots);
  } catch (error) {
    console.error('Error fetching bots:', error);
    return NextResponse.json({ error: 'Failed to fetch bots' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Verify admin access
  const authResponse = await verifyAdminAccess(request);
  if (authResponse) return authResponse;

  try {
    // Parse request body
    const body = await request.json();

    // Validate required fields
    const requiredFields = ['type', 'pair', 'user', 'confidence', 'status'];
    for (const field of requiredFields) {
      if (!(field in body)) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
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

    // Find user by name or email to get ObjectId
    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const user = await userModel
      .findOne({
        $or: [{ name: body.user }, { email: body.user }],
      })
      .lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Create new bot
    const newBot = new TradingBotModel({
      type: body.type,
      pair: body.pair.toUpperCase(),
      userId: user._id,
      confidence: body.confidence,
      status: body.status,
      pnl: body.pnl || '+0.0%',
    });

    const savedBot = await newBot.save();

    // Populate user for response
    const populatedBot = await TradingBotModel.findById(savedBot._id)
      .populate('userId', 'name email')
      .lean();

    // Transform to match frontend format
    const formattedBot = {
      id: populatedBot._id.toString(),
      type: populatedBot.type,
      pair: populatedBot.pair,
      user: populatedBot.userId
        ? (populatedBot.userId as unknown as PopulatedUserRef).name ||
          (populatedBot.userId as unknown as PopulatedUserRef).email
        : 'Unknown',
      confidence: populatedBot.confidence,
      status: populatedBot.status,
      pnl: populatedBot.pnl || '+0.0%',
    };

    // Note: an admin-created flow carries no allocatedAmount and so debits
    // nothing - unlike the user-facing create path, which allocates capital
    // through the ledger. Logged as an admin action either way.
    await recordAdminAction(request, {
      action: 'bot.create',
      targetType: 'bot',
      targetId: savedBot._id.toString(),
      after: {
        type: savedBot.type,
        pair: savedBot.pair,
        userId: user._id.toString(),
        confidence: savedBot.confidence,
        status: savedBot.status,
      },
    });

    return NextResponse.json(formattedBot, { status: 201 });
  } catch (error) {
    console.error('Error creating bot:', error);
    return NextResponse.json({ error: 'Failed to create bot' }, { status: 500 });
  }
}
