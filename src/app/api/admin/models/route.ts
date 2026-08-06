import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { MLModelModel } from '@/lib/models/MLModel';
import { verifyAdminAccess } from '@/lib/auth-middleware';
import { recordAdminAction } from '@/lib/audit-log';
import { adminCreateModelSchema, parseBody } from '@/lib/validation';

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
    const formattedModels = models.map((model) => ({
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
    const { data: body, error: invalid } = await parseBody(request, adminCreateModelSchema);
    if (invalid) return invalid;

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

    await recordAdminAction(request, {
      action: 'model.create',
      targetType: 'model',
      targetId: savedModel._id.toString(),
      after: {
        name: savedModel.name,
        scope: savedModel.scope,
        confidence: savedModel.confidence,
        drift: savedModel.drift,
      },
    });

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
