import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { TradingBotModel } from '@/lib/models';
import { getSessionFromRequest } from '@/lib/session';

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

    // Transform to match frontend format
    const formattedBots = bots.map((bot: any) => ({
      id: bot._id.toString(),
      type: bot.type,
      pair: bot.pair,
      confidence: bot.confidence,
      status: bot.status,
      pnl: bot.pnl || '+0.0%',
    }));

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

    // Parse request body
    const body = await request.json();

    // Validate required fields
    const requiredFields = ['type', 'pair', 'confidence', 'status'];
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

    // Get userId from session (now properly authenticated)
    const userId = session.user.id;

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Create new bot for the user
    const newBot = new TradingBotModel({
      type: body.type,
      pair: body.pair.toUpperCase(), // Ensure pair is uppercase
      userId, // Reference to the User
      confidence: body.confidence,
      status: body.status,
      pnl: body.pnl || '+0.0%',
    });

    const savedBot = await newBot.save();

    // Return the created bot in frontend format
    return NextResponse.json(
      {
        id: savedBot._id.toString(),
        type: savedBot.type,
        pair: savedBot.pair,
        confidence: savedBot.confidence,
        status: savedBot.status,
        pnl: savedBot.pnl || '+0.0%',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating bot:', error);
    return NextResponse.json({ error: 'Failed to create bot' }, { status: 500 });
  }
}
