import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { encryptPii, lastFour, maskFromLastFour, PiiCryptoError } from '@/lib/pii-crypto';

const ID_TYPES = ['passport', 'drivers_license', 'national_id'];

// GET /api/kyc - Returns the current user's KYC status and submitted info
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
    documentProvided: user.kycDocumentProvided || false,
    rejectionReason: user.kycRejectionReason || null,
  });
}

// POST /api/kyc - Submit (or resubmit) a KYC application
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { fullName, dateOfBirth, country, idType, idNumber, documentProvided } = body;

  const requiredFields = { fullName, dateOfBirth, country, idType, idNumber };
  for (const [field, value] of Object.entries(requiredFields)) {
    if (!value || typeof value !== 'string' || !value.trim()) {
      return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
    }
  }

  if (!ID_TYPES.includes(idType)) {
    return NextResponse.json(
      { error: `Invalid idType. Must be one of: ${ID_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
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
          kycDocumentProvided: !!documentProvided,
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
