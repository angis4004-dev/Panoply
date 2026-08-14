import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { recordAdminAction } from '@/lib/admin/audit';
import { grantAchievement, recalculateTier } from '@/lib/achievements/engine';
import { decryptPii, isEncrypted, maskFromLastFour } from '@/lib/pii-crypto';
import { createNotification } from '@/lib/notifications';
import { kycDecisionSchema, objectId, parseBody } from '@/lib/validation';

/**
 * GET - the full submission for one applicant, including the decrypted
 * identity number.
 *
 * The single place in the application that decrypts an identity number. It is
 * deliberately per-record: the list endpoint returns masks, so reviewing one
 * applicant reveals one number rather than the whole queue's worth. It also
 * requires kyc.review rather than kyc.read - seeing the real number is part of
 * making a decision, not part of looking at the queue.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'kyc.review');
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid user id' }, { status: 400 });
  }

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const user = await UserModel.findById(id).select('-passwordHash').lean();
  if (!user) return adminJson({ error: 'User not found' }, { status: 404 });

  // A value that cannot be decrypted - wrong key, or a row the migration never
  // reached - must not take down the review screen. The reviewer sees that it
  // is unavailable and can ask the applicant to resubmit.
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

  await recordAdminAction(guard.ctx, {
    action: 'kyc.view',
    targetType: 'kyc',
    targetId: id,
    affectedUserId: id,
    after: { email: user.email },
    reason: 'Reviewer opened the identity submission.',
  });

  return adminJson({
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
}

/** PATCH - approve or reject a submission. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'kyc.review');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!objectId.safeParse(id).success) {
    return adminJson({ error: 'Invalid user id' }, { status: 400 });
  }

  // The schema carries the "a rejection needs a reason" rule, so it cannot be
  // satisfied here and forgotten on some future second decision endpoint.
  const { data: body, error: invalid } = await parseBody(request, kycDecisionSchema);
  if (invalid) return invalid;

  const action = body.action;
  const rejectionReason = body.action === 'reject' ? body.reason.trim() : null;

  const connection = await connectToDatabase();
  if (!connection) return adminJson({ error: 'Database connection unavailable' }, { status: 503 });

  const previous = await UserModel.findById(id).select('kycStatus +kycDocumentData').lean();
  if (!previous) return adminJson({ error: 'User not found' }, { status: 404 });

  if (action === 'approve' && !previous.kycDocumentData) {
    return adminJson(
      { error: 'A document must be on file before approving verification.' },
      { status: 422 }
    );
  }

  const updated = await UserModel.findByIdAndUpdate(
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
  if (!updated) return adminJson({ error: 'User not found' }, { status: 404 });

  // An approval is what unlocks deposits, so who approved whom - and on what
  // grounds a rejection was issued - is exactly what an operational review
  // reconstructs.
  await recordAdminAction(ctx, {
    action: action === 'approve' ? 'kyc.approve' : 'kyc.reject',
    targetType: 'kyc',
    targetId: id,
    affectedUserId: id,
    before: { kycStatus: previous.kycStatus ?? 'unverified' },
    after: { kycStatus: updated.kycStatus },
    reason: rejectionReason ?? 'Identity verified after document review.',
  });

  // The applicant has been waiting on this and there is no other way they
  // would learn it. A rejection carries the reviewer's reason verbatim,
  // because "rejected" on its own gives someone nothing to act on and they
  // will simply resubmit the same thing.
  if (action === 'approve') {
    await createNotification({
      userId: id,
      type: 'kyc',
      title: 'Identity verified',
      body: 'Your identity has been verified. Vault deposits and withdrawals are now unlocked.',
      href: '/dashboard/kyc',
    });
    await grantAchievement(id, 'verified_identity');
    await recalculateTier(id);
  } else {
    await createNotification({
      userId: id,
      type: 'kyc',
      title: 'Verification could not be completed',
      body: rejectionReason
        ? `${rejectionReason} You can correct your details and resubmit.`
        : 'Your application could not be verified. You can correct your details and resubmit.',
      href: '/dashboard/kyc',
    });
  }

  return adminJson({
    id: updated._id.toString(),
    status: updated.kycStatus,
    rejectionReason: updated.kycRejectionReason || null,
  });
}
