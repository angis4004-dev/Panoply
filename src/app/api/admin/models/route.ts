import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { MLModelModel } from '@/lib/models/MLModel';
import { verifyAdminAccess } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  // Verify admin access
  const authResponse = await verifyAdminAccess(request);
  if (authResponse) return authResponse;

  try {
    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const models = await MLModelModel.find().lean();

    // Transform to match frontend format
    const formattedModels = models.map((model: any) => ({
      id: model._id.toString(),
      name: model.name,
      scope: model.scope,
      confidence: model.confidence,
      drift: model.drift,
      retrained: model.lastTrained
        ? new Date(model.lastTrained).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }) + ' ago'
        : 'just now',
    }));

    return NextResponse.json(formattedModels);
  } catch (error) {
    console.error('Error fetching ML models:', error);
    return NextResponse.json({ error: 'Failed to fetch ML models' }, { status: 500 });
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
    const requiredFields = ['name', 'scope', 'confidence', 'drift'];
    for (const field of requiredFields) {
      if (!(field in body)) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    // Validate enum values
    const validDrifts = ['stable', 'watch', 'critical'];
    if (!validDrifts.includes(body.drift)) {
      return NextResponse.json(
        { error: `Invalid drift. Must be one of: ${validDrifts.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate confidence range
    if (body.confidence < 0 || body.confidence > 100) {
      return NextResponse.json({ error: 'Confidence must be between 0 and 100' }, { status: 400 });
    }

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Create new model
    const newModel = new MLModelModel({
      name: body.name,
      scope: body.scope,
      confidence: body.confidence,
      drift: body.drift,
      lastTrained: new Date(), // Set to now
    });

    const savedModel = await newModel.save();

    // Transform to match frontend format
    const formattedModel = {
      id: savedModel._id.toString(),
      name: savedModel.name,
      scope: savedModel.scope,
      confidence: savedModel.confidence,
      drift: savedModel.drift,
      retrained: 'just now',
    };

    return NextResponse.json(formattedModel, { status: 201 });
  } catch (error) {
    console.error('Error creating ML model:', error);
    return NextResponse.json({ error: 'Failed to create ML model' }, { status: 500 });
  }
}
