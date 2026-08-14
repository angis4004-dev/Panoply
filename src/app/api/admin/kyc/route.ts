import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { maskFromLastFour } from '@/lib/pii-crypto';

/**
 * The KYC queue.
 *
 * Scoped to users who actually submitted - this previously returned every user
 * in the system, including the majority who had never started KYC, which made
 * a routine list request a dump of the whole user table.
 *
 * Identity numbers are masked here. The review path that genuinely needs the
 * real one is GET /api/admin/kyc/[id], one record at a time, and it requires
 * kyc.review rather than kyc.read.
 */
export async function GET(request: NextRequest) {
  const guard = await requireActiveAdmin(request, 'kyc.read');
  if (!guard.ok) return guard.response;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const status = request.nextUrl.searchParams.get('status');
  const query: Record<string, unknown> = {
    kycStatus: status ? status : { $in: ['pending', 'verified', 'rejected'] },
  };

  const users = await UserModel.find(query, {
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
  })
    .sort({ kycSubmittedAt: -1 })
    .limit(200)
    .lean();

  return adminJson({
    submissions: users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      status: user.kycStatus || 'unverified',
      submittedAt: user.kycSubmittedAt || null,
      fullName: user.kycFullName || '',
      dateOfBirth: user.kycDateOfBirth || '',
      country: user.kycCountry || '',
      idType: user.kycIdType || '',
      idNumberMasked: maskFromLastFour(user.kycIdNumberLast4),
      documentProvided: user.kycDocumentProvided || false,
      rejectionReason: user.kycRejectionReason || null,
    })),
  });
}
