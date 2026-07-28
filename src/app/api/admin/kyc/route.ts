import { NextRequest, NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { verifyAdminAccess } from '@/lib/auth-middleware';

// GET /api/admin/kyc - Returns every user's KYC submission for review
export async function GET(request: NextRequest) {
  const authResponse = await verifyAdminAccess(request);
  if (authResponse) return authResponse;

  try {
    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const users = await userModel.find({}, { passwordHash: 0 }).sort({ kycSubmittedAt: -1 }).lean();

    const submissions = users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      status: user.kycStatus || 'unverified',
      submittedAt: user.kycSubmittedAt || null,
      fullName: user.kycFullName || '',
      dateOfBirth: user.kycDateOfBirth || '',
      country: user.kycCountry || '',
      idType: user.kycIdType || '',
      idNumber: user.kycIdNumber || '',
      documentProvided: user.kycDocumentProvided || false,
      rejectionReason: user.kycRejectionReason || null,
    }));

    return NextResponse.json(submissions);
  } catch (error) {
    console.error('Error fetching KYC submissions:', error);
    return NextResponse.json({ error: 'Failed to fetch KYC submissions' }, { status: 500 });
  }
}
