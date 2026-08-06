import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { connectToDatabase } from '@/lib/mongo';
import { ReportModel } from '@/lib/models/Report';
import { createReportSchema, parseBody } from '@/lib/validation';

// GET /api/reports - Returns ONLY the reports belonging to the currently logged-in user
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

    // Find reports for the specific user, sorted by date descending (newest first)
    const reports = await ReportModel.find({ userId }).sort({ date: -1 }).lean();

    // Transform to match frontend format
    const formattedReports = reports.map((report) => ({
      id: report._id.toString(),
      title: report.title,
      description: report.description,
      type: report.type,
      status: report.status,
      date: report.date.toISOString(),
      metrics: report.metrics,
      holdings: report.holdings,
      recommendations: report.recommendations,
    }));

    return NextResponse.json(formattedReports);
  } catch (error) {
    console.error('Error fetching user reports:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

// POST /api/reports - Allows the logged-in user to create a new report
export async function POST(request: NextRequest) {
  try {
    // Get session to identify the current user
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const { data: body, error: invalid } = await parseBody(request, createReportSchema);
    if (invalid) return invalid;

    const validStatuses = ['pending', 'success', 'failed'];
    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Get userId from session (now properly authenticated)
    const userId = session.user.id;

    const connection = await connectToDatabase();
    if (!connection) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Create new report for the user
    const newReport = new ReportModel({
      userId, // Reference to the User
      title: body.title,
      description: body.description,
      type: body.type,
      status: body.status || 'pending',
      date: new Date(body.date || Date.now()),
      metrics: body.metrics || {},
      holdings: body.holdings || [],
      recommendations: body.recommendations || [],
    });

    const savedReport = await newReport.save();

    // Return the created report in frontend format
    return NextResponse.json(
      {
        id: savedReport._id.toString(),
        title: savedReport.title,
        description: savedReport.description,
        type: savedReport.type,
        status: savedReport.status,
        date: savedReport.date.toISOString(),
        metrics: savedReport.metrics,
        holdings: savedReport.holdings,
        recommendations: savedReport.recommendations,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating report:', error);
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
  }
}
