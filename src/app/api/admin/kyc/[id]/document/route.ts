import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { UserModel } from '@/lib/models/user';
import { adminJson, requireActiveAdmin } from '@/lib/admin/guard';
import { decryptPiiBuffer, PiiCryptoError } from '@/lib/pii-crypto';
import { recordAdminAction } from '@/lib/admin/audit';
import { objectId } from '@/lib/validation';

/**
 * GET /api/admin/kyc/[id]/document - Serves one applicant's identity document
 * to a reviewer.
 *
 * Storing documents is only worth doing if review can see them, and this is
 * the sole path that decrypts one. It is the most sensitive endpoint in the
 * application: a scanned passport, in the clear, over HTTP.
 *
 * Five things constrain it.
 *
 * The kyc.review permission, on the admin host, with a live admin session -
 * not "is this user an Admin", which is the check this replaced.
 *
 * One record per request. Like GET /api/admin/kyc/[id] and its identity
 * number, reviewing one applicant exposes one document rather than the
 * queue's worth.
 *
 * Every view is written to the admin audit log, and the document is not served
 * if that write fails. Looking at someone's passport is an action, not a read,
 * and an unlogged view is worse than a refused one.
 *
 * Never cached. no-store keeps it out of the browser cache, any intermediary,
 * and the back/forward cache - the default for an image response would happily
 * leave a copy on disk.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireActiveAdmin(request, 'kyc.review');
  if (!guard.ok) return guard.response;
  const { ctx } = guard;

  try {
    const { id } = await params;
    if (!objectId.safeParse(id).success) {
      return adminJson({ error: 'Invalid user id' }, { status: 400 });
    }

    const connection = await connectToDatabase();
    if (!connection) {
      return adminJson({ error: 'Database connection unavailable' }, { status: 503 });
    }

    // kycDocumentData is select:false on the schema, so it has to be asked for.
    const user = await UserModel.findById(id)
      .select('+kycDocumentData kycDocumentMimeType kycDocumentSize email')
      .lean();

    if (!user) return adminJson({ error: 'User not found' }, { status: 404 });
    if (!user.kycDocumentData) {
      return adminJson({ error: 'No document on file for this user.' }, { status: 404 });
    }

    let bytes: Buffer;
    try {
      bytes = decryptPiiBuffer(user.kycDocumentData);
    } catch (error) {
      // A document that cannot be decrypted - wrong key, or a corrupted row -
      // must not read as "no document". The reviewer needs to know the
      // difference, because one means ask for a resubmission and the other
      // means something is wrong with the deployment.
      if (error instanceof PiiCryptoError) {
        console.error(`KYC document for ${id} could not be decrypted:`, error.message);
        return adminJson(
          { error: 'The stored document could not be decrypted. Ask the applicant to resubmit.' },
          { status: 422 }
        );
      }
      throw error;
    }

    const audited = await recordAdminAction(ctx, {
      action: 'kyc.document.view',
      targetType: 'kyc',
      targetId: id,
      affectedUserId: id,
      // Nothing changed, so there is no before/after pair - `after` carries
      // what was looked at instead. Which document and how large is enough to
      // reconstruct the event without copying any of its contents into a log.
      after: { email: user.email, bytes: bytes.length },
      reason: 'Reviewer opened the identity document.',
    });
    if (!audited) {
      return adminJson(
        { error: 'The document cannot be opened until access logging is available.' },
        { status: 503 }
      );
    }

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': user.kycDocumentMimeType || 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        // Shown in the browser rather than downloaded, so reviewing does not
        // scatter copies through the reviewer's Downloads folder.
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Error serving KYC document:', error);
    return adminJson({ error: 'Unable to load the document.' }, { status: 500 });
  }
}
