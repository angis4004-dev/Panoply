import { NextRequest, NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { verifyAdminAccess } from '@/lib/auth-middleware';
import { maskFromLastFour } from '@/lib/pii-crypto';

// GET /api/admin/kyc - Returns every user's KYC submission for review
export async function GET(request: NextRequest) {
  const authResponse = await verifyAdminAccess(request);
  if (authResponse) return authResponse;

  try {
    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // Scoped to users who actually submitted. This previously returned every
    // user in the system, including the majority who had never started KYC,
    // which made a routine list request a dump of the whole user table.
    const users = await userModel
      .find(
        { kycStatus: { $in: ['pending', 'verified', 'rejected'] } },
        {
          name: 1,
          email: 1,
          kycStatus: 1,
          kycSubmittedAt: 1,
          kycFullName: 1,
          kycDateOfBirth: 1,
          kycCountry: 1,
          kycIdType: 1,
          kycIdNumberLast4: 1,
          kycDocumentProvided: 1,
          kycRejectionReason: 1,
        }
      )
      .sort({ kycSubmittedAt: -1 })
      .lean();

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
      // Masked in the list. The admin dashboard never displayed the full
      // number anyway, so this endpoint was exposing it to no purpose. The
      // review path that genuinely needs it is GET /api/admin/kyc/[id], one
      // record at a time.
      idNumberMasked: maskFromLastFour(user.kycIdNumberLast4),
      documentProvided: user.kycDocumentProvided || false,
      rejectionReason: user.kycRejectionReason || null,
    }));

    return NextResponse.json(submissions);
  } catch (error) {
    console.error('Error fetching KYC submissions:', error);
    return NextResponse.json({ error: 'Failed to fetch KYC submissions' }, { status: 500 });
  }
}
