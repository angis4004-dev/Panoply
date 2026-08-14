'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader } from '@/components/ui/loader';

/**
 * Review one submission.
 *
 * The full identity number and the document are fetched only when the
 * reviewer opens the panel, never as part of the list. Both requests are
 * written to the audit log server-side, so "who looked at whose passport" has
 * an answer without the UI having to report anything.
 *
 * The document is fetched as a blob and rendered from an object URL rather
 * than pointed at with an <img src>. A plain src would work, but the blob is
 * revoked when the panel closes, which keeps the decrypted bytes out of the
 * browser's image cache for the rest of the session.
 */

const FIELD =
  'w-full rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1.5 text-ds-caption text-ds-text outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/40';

interface Submission {
  fullName: string;
  dateOfBirth: string;
  country: string;
  idType: string;
  idNumber: string;
}

export function KycReview({
  userId,
  documentProvided,
}: {
  userId: string;
  documentProvided: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<Submission | null>(null);
  const [documentUrl, setDocumentUrl] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/admin/kyc/${userId}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast.error(payload.error ?? 'Could not load the submission.');
          return;
        }
        if (!cancelled) setDetail(payload);
      } catch {
        toast.error('Could not load the submission.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  // Revoke the object URL when the panel closes or the component unmounts.
  React.useEffect(() => {
    return () => {
      if (documentUrl) URL.revokeObjectURL(documentUrl);
    };
  }, [documentUrl]);

  async function loadDocument() {
    try {
      const response = await fetch(`/api/admin/kyc/${userId}/document`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        toast.error(payload.error ?? 'Could not load the document.');
        return;
      }
      const blob = await response.blob();
      setDocumentUrl(URL.createObjectURL(blob));
    } catch {
      toast.error('Could not load the document.');
    }
  }

  async function decide(action: 'approve' | 'reject') {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/kyc/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'approve' ? { action } : { action, reason: reason.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(payload.error ?? 'The decision was not recorded.');
        return;
      }
      toast.success(action === 'approve' ? 'Identity verified.' : 'Submission rejected.');
      setOpen(false);
      router.refresh();
    } catch {
      toast.error('Unable to reach the server.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1 text-ds-caption text-ds-text hover:bg-ds-surface-overlay"
      >
        Review
      </button>
    );
  }

  return (
    <div className="w-80 space-y-2 rounded border border-ds-border-strong bg-ds-surface-overlay p-2">
      {detail ? (
        <dl className="space-y-0.5 text-ds-caption text-ds-text-muted">
          <div>
            <dt className="inline text-ds-text-muted">Name: </dt>
            <dd className="inline text-ds-text">{detail.fullName || '—'}</dd>
          </div>
          <div>
            <dt className="inline text-ds-text-muted">Born: </dt>
            <dd className="inline text-ds-text">{detail.dateOfBirth || '—'}</dd>
          </div>
          <div>
            <dt className="inline text-ds-text-muted">Country: </dt>
            <dd className="inline text-ds-text">{detail.country || '—'}</dd>
          </div>
          <div>
            <dt className="inline text-ds-text-muted">{detail.idType || 'ID'}: </dt>
            <dd className="inline font-mono text-ds-text">{detail.idNumber || '—'}</dd>
          </div>
        </dl>
      ) : (
        <p className="flex items-center gap-2 text-ds-caption text-ds-text-muted">
          <Loader size={16} />
          Loading submission…
        </p>
      )}

      {documentProvided ? (
        documentUrl ? (
          // decrypted bytes cannot go through the image optimizer, which would
          // fetch and cache it on the server.
          <img
            src={documentUrl}
            alt="Identity document as submitted"
            className="max-h-64 w-full rounded border border-ds-border object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={loadDocument}
            className="w-full rounded border border-ds-border-strong bg-ds-surface-inset px-2 py-1 text-ds-caption text-ds-text hover:bg-ds-surface-overlay"
          >
            Open identity document
          </button>
        )
      ) : (
        <p className="rounded border border-ds-value-warning/30 bg-ds-value-warning/[0.07] px-2 py-1 text-ds-caption text-ds-value-warning">
          No document on file. Approval is refused until the applicant uploads one.
        </p>
      )}

      <label className="block text-ds-caption text-ds-text-muted">
        Rejection reason (shown to the applicant)
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          className={`${FIELD} mt-0.5`}
        />
      </label>

      <div className="flex gap-1">
        <button
          type="button"
          disabled={busy || !documentProvided}
          onClick={() => decide('approve')}
          title={documentProvided ? undefined : 'A document must be on file first'}
          className="flex-1 rounded bg-ds-value-positive/15 px-2 py-1 text-ds-caption font-semibold text-ds-value-positive hover:bg-ds-value-positive/25 disabled:opacity-40"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy || reason.trim().length === 0}
          onClick={() => decide('reject')}
          title={reason.trim() ? undefined : 'A reason is required'}
          className="flex-1 rounded bg-ds-value-negative/15 px-2 py-1 text-ds-caption font-semibold text-ds-value-negative hover:bg-ds-value-negative/25 disabled:opacity-40"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-ds-border-strong px-2 py-1 text-ds-caption text-ds-text-secondary"
        >
          Close
        </button>
      </div>
    </div>
  );
}
