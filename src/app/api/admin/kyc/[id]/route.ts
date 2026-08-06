import { NextRequest, NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { verifyAdminAccess } from '@/lib/auth-middleware';
import { grantAchievement, recalculateTier } from '@/lib/achievements/engine';
import { decryptPii, isEncrypted, maskFromLastFour } from '@/lib/pii-crypto';
import { recordAdminAction } from '@/lib/audit-log';
import { kycDecisionSchema, parseBody } from '@/lib/validation';

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

    // The schema carries the "a rejection needs a reason" rule, so it cannot
    // be satisfied here and forgotten on some future second decision endpoint.
    const { data: body, error: invalid } = await parseBody(request, kycDecisionSchema);
    if (invalid) return invalid;

    // Narrowed here rather than destructured, so `reason` stays a plain string
    // on the reject branch instead of an optional the compiler has to be
    // reassured about at each use.
    const action = body.action;
    const rejectionReason = body.action === 'reject' ? body.reason.trim() : null;

    const userModel = await getUserModel();
    if (!userModel) {
      return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
    }

    const previous = await userModel.findById(id).select('kycStatus').lean();

    const updated = await userModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            kycStatus: action === 'approve' ? 'verified' : 'rejected',
            kycRejectionReason: rejectionReason,
          },
        },
        { new: true, runValidators: true }
      )
      .select('-passwordHash')
      .lean();

    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // An approval is what unlocks deposits and strategy activation, so who
    // approved whom - and on what grounds a rejection was issued - is exactly
    // what an operational review reconstructs.
    await recordAdminAction(request, {
      action: action === 'approve' ? 'kyc.approve' : 'kyc.reject',
      targetType: 'kyc',
      targetId: id,
      before: { kycStatus: previous?.kycStatus ?? 'unverified' },
      after: { kycStatus: updated.kycStatus },
      reason: rejectionReason ?? '',
    });

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
