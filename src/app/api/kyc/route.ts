import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { requireUnlock } from '@/lib/dashboard-unlock';
import { getUserModel } from '@/lib/models';
import { encryptPii, lastFour, maskFromLastFour, PiiCryptoError } from '@/lib/pii-crypto';
import { kycSubmissionSchema, parseBody } from '@/lib/validation';

// GET /api/kyc - Returns the current user's KYC status and submitted info
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const user = await userModel.findById(session.user.id).lean();
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: user.kycStatus || 'unverified',
    submittedAt: user.kycSubmittedAt || null,
    fullName: user.kycFullName || '',
    dateOfBirth: user.kycDateOfBirth || '',
    country: user.kycCountry || '',
    idType: user.kycIdType || '',
    // Deliberately never the real number, not even to its owner: this response
    // has no use for it that a mask does not serve, and returning it put the
    // value into browser memory, history, and any logging proxy in between.
    // Resubmission therefore starts from an empty field and the number is
    // re-entered, which is correct - it is not ours to hand back.
    idNumber: '',
    idNumberMasked: maskFromLastFour(user.kycIdNumberLast4),
    // Metadata only. The document itself is never served back to its owner:
    // they already have it, and a read path would be one more place an
    // identity document could leak from. Only the admin review route decrypts.
    documentProvided: user.kycDocumentProvided || false,
    documentMimeType: user.kycDocumentMimeType || null,
    documentSize: user.kycDocumentSize ?? null,
    documentUploadedAt: user.kycDocumentUploadedAt || null,
    rejectionReason: user.kycRejectionReason || null,
  });
}

// POST /api/kyc - Submit (or resubmit) a KYC application
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const locked = requireUnlock(request, session);
  if (locked) return locked;

  const { data: body, error: invalid } = await parseBody(request, kycSubmissionSchema);
  if (invalid) return invalid;
  const { fullName, dateOfBirth, country, idType, idNumber } = body;

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const existing = await userModel.findById(session.user.id).select('+kycDocumentData kycStatus');
  if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (existing.kycStatus === 'verified') {
    return NextResponse.json({ error: 'Your identity is already verified.' }, { status: 409 });
  }
  if (!existing.kycDocumentData) {
    return NextResponse.json(
      { error: 'Upload a valid identity document before submitting verification.' },
      { status: 400 }
    );
  }

  // Encrypted before it reaches the database, so the plaintext exists only for
  // the lifetime of this request. A missing or malformed key fails the request
  // rather than falling back to storing it in the clear.
  const trimmedIdNumber = idNumber.trim();
  let encryptedIdNumber: string;
  try {
    encryptedIdNumber = encryptPii(trimmedIdNumber);
  } catch (error) {
    if (error instanceof PiiCryptoError) {
      console.error('KYC submission blocked - PII encryption unavailable:', error.message);
      return NextResponse.json(
        { error: 'Identity verification is temporarily unavailable. Please try again later.' },
        { status: 503 }
      );
    }
    throw error;
  }

  const updated = await userModel
    .findByIdAndUpdate(
      session.user.id,
      {
        $set: {
          kycStatus: 'pending',
          kycSubmittedAt: new Date(),
          kycFullName: fullName.trim(),
          kycDateOfBirth: dateOfBirth.trim(),
          kycCountry: country.trim(),
          kycIdType: idType,
          kycIdNumber: encryptedIdNumber,
          kycIdNumberLast4: lastFour(trimmedIdNumber),
          kycDocumentProvided: true,
          kycRejectionReason: null,
        },
      },
      { new: true, runValidators: true }
    )
    .lean();

  if (!updated) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    status: updated.kycStatus,
    submittedAt: updated.kycSubmittedAt,
  });
}
