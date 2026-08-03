import { NextRequest, NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { verifyAdminAccess } from '@/lib/auth-middleware';
import { grantAchievement, recalculateTier } from '@/lib/achievements/engine';
import { decryptPii, isEncrypted, maskFromLastFour } from '@/lib/pii-crypto';

/**
 * GET /api/admin/kyc/[id] - Full submission for one user, including the
 * decrypted identity number.
 *
 * The single place in the application that decrypts an identity number. It is
 * deliberately per-record: the list endpoint returns masks, so reviewing one
 * applicant reveals one number rather than the whole queue's worth.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await verifyAdminAccess(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const user = await userModel.findById(id).select('-passwordHash').lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // A value that cannot be decrypted - wrong key, or a row the migration
    // never reached - must not take down the review screen. The reviewer sees
    // that it is unavailable and can ask the applicant to resubmit.
    let idNumber = '';
    if (user.kycIdNumber) {
      try {
        idNumber = isEncrypted(user.kycIdNumber)
          ? decryptPii(user.kycIdNumber)
          : '(stored unencrypted - resubmission required)';
      } catch (error) {
        console.error(`Failed to decrypt KYC id number for user ${id}:`, error);
        idNumber = '(unavailable)';
      }
    }

    return NextResponse.json({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      status: user.kycStatus || 'unverified',
      submittedAt: user.kycSubmittedAt || null,
      fullName: user.kycFullName || '',
      dateOfBirth: user.kycDateOfBirth || '',
      country: user.kycCountry || '',
      idType: user.kycIdType || '',
      idNumber,
      idNumberMasked: maskFromLastFour(user.kycIdNumberLast4),
      documentProvided: user.kycDocumentProvided || false,
      rejectionReason: user.kycRejectionReason || null,
    });
  } catch (error) {
    console.error('Error fetching KYC submission:', error);
    return NextResponse.json({ error: 'Failed to fetch KYC submission' }, { status: 500 });
  }
}

// PATCH /api/admin/kyc/[id] - Approve or reject a user's KYC submission
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResponse = await verifyAdminAccess(request);
  if (authResponse) return authResponse;

  try {
    const { id } = await params;

    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const body = await request.json();
    const { action, reason } = body;

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: "Invalid action. Must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    if (action === 'reject' && (!reason || typeof reason !== 'string' || !reason.trim())) {
      return NextResponse.json({ error: 'A rejection reason is required' }, { status: 400 });
    }

    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const updated = await userModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            kycStatus: action === 'approve' ? 'verified' : 'rejected',
            kycRejectionReason: action === 'reject' ? reason.trim() : null,
          },
        },
        { new: true, runValidators: true }
      )
      .select('-passwordHash')
      .lean();

    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'approve') {
      await grantAchievement(id, 'verified_identity');
      await recalculateTier(id);
    }

    return NextResponse.json({
      id: updated._id.toString(),
      status: updated.kycStatus,
      rejectionReason: updated.kycRejectionReason || null,
    });
  } catch (error) {
    console.error('Error updating KYC status:', error);
    return NextResponse.json({ error: 'Failed to update KYC status' }, { status: 500 });
  }
}
