import { NextRequest, NextResponse } from 'next/server';
import { getUserModel } from '@/lib/models';
import { verifyAdminAccess } from '@/lib/auth-middleware';
import { decryptPiiBuffer, PiiCryptoError } from '@/lib/pii-crypto';
import { recordAdminAction } from '@/lib/audit-log';

/**
 * GET /api/admin/kyc/[id]/document - Serves one applicant's identity document
 * to a reviewer.
 *
 * Storing documents is only worth doing if review can see them, and this is
 * the sole path that decrypts one. It is the most sensitive endpoint in the
 * application: a scanned passport, in the clear, over HTTP.
 *
 * Four things constrain it.
 *
 * Admin-only, through the same verifyAdminAccess gate the rest of /api/admin
 * uses, which re-reads the role from the database rather than trusting the
 * session cookie's copy.
 *
 * One record per request. Like GET /api/admin/kyc/[id] and its identity
 * number, reviewing one applicant exposes one document rather than the
 * queue's worth.
 *
 * Every view is written to the admin audit log. Looking at someone's passport
 * is an action, not a read, and it should be answerable later who did it and
 * when.
 *
 * Never cached. no-store keeps it out of the browser cache, any intermediary,
 * and the back/forward cache - the default for an image response would happily
 * leave a copy on disk.
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

    // kycDocumentData is select:false on the schema, so it has to be asked for.
    const user = await userModel
      .findById(id)
      .select('+kycDocumentData kycDocumentMimeType kycDocumentSize email')
      .lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!user.kycDocumentData) {
      return NextResponse.json({ error: 'No document on file for this user.' }, { status: 404 });
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
        return NextResponse.json(
          { error: 'The stored document could not be decrypted. Ask the applicant to resubmit.' },
          { status: 422 }
        );
      }
      throw error;
    }

    await recordAdminAction(request, {
      action: 'kyc.document.view',
      targetType: 'kyc',
      targetId: id,
      // Nothing changed, so there is no before/after pair - `after` carries
      // what was looked at instead. Which document and how large is enough to
      // reconstruct the event without copying any of its contents into a log.
      after: { email: user.email, bytes: bytes.length },
      reason: 'Reviewer opened the identity document',
    }).catch((err) => {
      // Logging must not swallow the response, but a failure here is worth
      // knowing about: it means a document view happened unrecorded.
      console.error('Failed to record KYC document view:', err);
    });

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
    return NextResponse.json({ error: 'Unable to load the document.' }, { status: 500 });
  }
}
