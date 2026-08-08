import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getUserModel } from '@/lib/models';
import { encryptPiiBuffer, PiiCryptoError } from '@/lib/pii-crypto';

/**
 * Identity document upload.
 *
 * The control this replaces never uploaded anything. It took the chosen file,
 * set a `documentProvided` boolean to true, and dropped the file on the floor
 * - the POST body was JSON carrying that boolean. Anyone could "provide" a
 * document by selecting any file at all, and a reviewer was shown a tick with
 * nothing behind it.
 *
 * The bytes are encrypted before they touch the database and the plaintext
 * exists only for the life of this request, matching how the identity number
 * is handled. A missing or malformed key fails the upload rather than falling
 * back to storing an identity document in the clear.
 */

/** Formats browsers actually produce from a camera or a scan. */
const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['application/pdf', 'pdf'],
]);

/**
 * 6MB of original bytes. Encryption base64urls the ciphertext, so the stored
 * string is about 1.33x this, and the whole user document has to stay under
 * MongoDB's 16MB ceiling with room to spare. The client downscales photos well
 * below this before sending, so the limit only catches unprocessed uploads.
 */
const MAX_BYTES = 6 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get('document');
    if (candidate instanceof File) file = candidate;
  } catch {
    return NextResponse.json({ error: 'Expected a multipart upload.' }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No document was attached.' }, { status: 400 });
  }

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: 'Upload a JPEG, PNG, WebP or PDF of your document.' },
      { status: 415 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 6MB.` },
      { status: 413 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // file.type is whatever the browser asserted, which a scripted caller can
  // set to anything. Checking the leading bytes means a mislabelled or
  // deliberately disguised file is rejected rather than stored and later
  // served back to a reviewer under a content type it does not match.
  if (!looksLike(bytes, file.type)) {
    return NextResponse.json(
      { error: 'That file does not appear to be the image type it claims to be.' },
      { status: 415 }
    );
  }

  let encrypted: string;
  try {
    encrypted = encryptPiiBuffer(bytes);
  } catch (error) {
    if (error instanceof PiiCryptoError) {
      console.error('KYC document upload blocked - PII encryption unavailable:', error.message);
      return NextResponse.json(
        { error: 'Document upload is temporarily unavailable. Please try again later.' },
        { status: 503 }
      );
    }
    throw error;
  }

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const updated = await userModel.findByIdAndUpdate(
    session.user.id,
    {
      $set: {
        kycDocumentData: encrypted,
        kycDocumentMimeType: file.type,
        kycDocumentSize: bytes.length,
        kycDocumentUploadedAt: new Date(),
        kycDocumentProvided: true,
      },
    },
    { new: true }
  );

  if (!updated) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Read one field back rather than trusting that the write took.
  //
  // Mongoose silently drops paths that are not in the compiled schema, so a
  // model compiled before these fields existed accepts the $set, discards it,
  // and still returns a document - the update "succeeds" and nothing is
  // stored. That happened here during development, and the shape of it is
  // exactly what this endpoint was built to eliminate: an upload control that
  // reports success while keeping no file. Telling someone their passport is
  // on file when it is not would be worse than refusing the upload.
  if (!updated.kycDocumentUploadedAt) {
    console.error(
      'KYC document write did not persist. The User model is probably compiled ' +
        'from a schema without kycDocument* - restart the server or redeploy.'
    );
    return NextResponse.json(
      { error: 'The document could not be saved. Please try again.' },
      { status: 500 }
    );
  }

  // Metadata only. The image is never echoed back, not even to the person who
  // just sent it: they already have it, and a read path would be one more
  // place an identity document can leak from.
  return NextResponse.json({
    uploaded: true,
    mimeType: file.type,
    size: bytes.length,
    uploadedAt: updated.kycDocumentUploadedAt,
  });
}

/**
 * Magic-number check. Deliberately shallow - this is a sanity check against
 * mislabelling, not a defence against a crafted polyglot file.
 */
function looksLike(bytes: Buffer, mimeType: string): boolean {
  if (bytes.length < 12) return false;
  switch (mimeType) {
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png':
      return bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return (
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'application/pdf':
      return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    default:
      return false;
  }
}

/**
 * DELETE /api/kyc/document - Removes the document on file.
 *
 * Exists so someone who uploaded the wrong thing is not stuck with it sitting
 * encrypted in the database until an admin intervenes. Blocked once review has
 * concluded: withdrawing the evidence behind an approval would leave a
 * verified account with nothing supporting it.
 */
export async function DELETE(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  const userModel = await getUserModel();
  if (!userModel) {
    return NextResponse.json({ error: 'Database connection unavailable' }, { status: 503 });
  }

  const user = await userModel.findById(session.user.id).select('kycStatus');
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (user.kycStatus === 'verified') {
    return NextResponse.json(
      { error: 'Your identity is already verified; the document on file cannot be removed here.' },
      { status: 409 }
    );
  }

  await userModel.findByIdAndUpdate(session.user.id, {
    $unset: {
      kycDocumentData: '',
      kycDocumentMimeType: '',
      kycDocumentSize: '',
      kycDocumentUploadedAt: '',
    },
    $set: { kycDocumentProvided: false },
  });

  return NextResponse.json({ removed: true });
}
