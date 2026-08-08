'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, FileText, RotateCcw, Trash2, Upload, X } from 'lucide-react';

/** Kept in step with ALLOWED in /api/kyc/document. */
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_BYTES = 6 * 1024 * 1024;

/**
 * Longest edge for a captured or chosen photo before upload.
 *
 * A modern phone camera produces 8-12MB, well over the server's limit, and
 * none of that resolution helps someone read a document number. 1600px keeps
 * text legible while landing typical uploads under 500KB.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

interface Existing {
  mimeType: string;
  size: number;
  uploadedAt: string;
}

/**
 * Capture or upload an identity document.
 *
 * Two routes to the same place, because neither works everywhere. The camera
 * path needs getUserMedia, which requires a secure context and a permission
 * the user can refuse; the file path always works and is how anyone with a
 * scan or a photo already on disk will do it. On a phone the file input is
 * often the better camera too - `capture="environment"` opens the native
 * camera app, which focuses and exposes better than a getUserMedia preview.
 *
 * Nothing is sent until the user has looked at the result and accepted it.
 * A blurred document means a rejected application and a repeated round trip,
 * so the preview and the retake are the point rather than decoration.
 */
export function IdDocumentCapture({
  existing,
  onChange,
}: {
  existing: Existing | null;
  onChange: (present: boolean) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'camera' | 'preview'>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onFile, setOnFile] = useState<Existing | null>(existing);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Releasing the camera matters more than it looks: a track left running
  // keeps the device's recording indicator lit after the user has moved on,
  // which reads as the app watching them.
  useEffect(() => stopCamera, [stopCamera]);

  // Object URLs are revoked as they are replaced, so a few retakes do not
  // accumulate blobs for the life of the page.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const showPreview = (file: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setMode('preview');
  };

  /** Downscale to MAX_EDGE and re-encode as JPEG. PDFs pass through. */
  const prepare = (file: File): Promise<File> =>
    new Promise((resolve) => {
      if (file.type === 'application/pdf') return resolve(file);

      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        if (scale === 1 && file.size <= MAX_BYTES) return resolve(file);

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            resolve(new File([blob], 'document.jpg', { type: 'image/jpeg' }));
          },
          'image/jpeg',
          JPEG_QUALITY
        );
      };
      // A file the browser cannot decode is passed straight through, so the
      // server's own type check is what rejects it and the message comes from
      // one place.
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so choosing the same file twice still fires a change.
    event.target.value = '';
    if (!file) return;
    setError(null);
    showPreview(await prepare(file));
  };

  const startCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open a camera here. Upload a photo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Rear camera where there is one; ideal rather than exact so a laptop
        // with only a front camera still works instead of throwing.
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode('camera');
      // The element only exists once mode flips, so attaching waits a tick.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it in your browser, or upload a photo instead.'
          : name === 'NotFoundError'
            ? 'No camera was found. Upload a photo instead.'
            : 'The camera could not be opened. Upload a photo instead.'
      );
    }
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('The photo could not be captured. Try again or upload a file.');
          return;
        }
        stopCamera();
        showPreview(new File([blob], 'document.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      JPEG_QUALITY
    );
  };

  const cancel = () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    setError(null);
    setMode('idle');
  };

  const upload = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('document', pendingFile);
      const res = await fetch('/api/kyc/document', { method: 'POST', body });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error || 'The document could not be uploaded.');
        return;
      }
      setOnFile({
        mimeType: payload.mimeType,
        size: payload.size,
        uploadedAt: payload.uploadedAt,
      });
      onChange(true);
      cancel();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/kyc/document', { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error || 'The document could not be removed.');
        return;
      }
      setOnFile(null);
      onChange(false);
    } finally {
      setBusy(false);
    }
  };

  const btn =
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-raised';
  const solid = `${btn} bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50`;
  const outline = `${btn} border border-ds-border-strong text-[#E7ECF2] hover:border-primary/40 hover:bg-ds-surface-inset disabled:cursor-not-allowed disabled:opacity-50`;

  return (
    <div className="rounded-lg border border-ds-border bg-ds-surface/40 p-4">
      <p className="mb-1 text-sm font-medium text-[#E7ECF2]">Photo of your ID</p>
      <p className="mb-4 text-xs text-ds-text-muted">
        The front of the document you selected above. Make sure all four corners are visible and the
        text is readable.
      </p>

      {/* Both inputs are visually hidden rather than display:none so they stay
          reachable to assistive tech and can be triggered by the buttons. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={onPick}
        className="sr-only"
        aria-label="Upload a photo of your ID"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="sr-only"
        aria-label="Take a photo of your ID"
      />

      {mode === 'idle' && !onFile && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              // On a touch device the native camera app focuses and exposes
              // better than a getUserMedia preview, so prefer it there and
              // fall back to the in-page camera on desktop.
              if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
                cameraInputRef.current?.click();
              } else {
                startCamera();
              }
            }}
            className={solid}
          >
            <Camera className="h-4 w-4" />
            Take a photo
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className={outline}>
            <Upload className="h-4 w-4" />
            Upload a file
          </button>
        </div>
      )}

      {mode === 'camera' && (
        <div>
          <div className="relative overflow-hidden rounded-lg border border-ds-border bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="block max-h-[320px] w-full object-contain"
            />
            {/* A frame to aim at. Purely a guide, so it is hidden from
                assistive tech rather than described. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-6 rounded-md border-2 border-dashed border-primary/50"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={shoot} className={solid}>
              <Camera className="h-4 w-4" />
              Capture
            </button>
            <button type="button" onClick={cancel} className={outline}>
              <X className="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'preview' && previewUrl && (
        <div>
          <div className="overflow-hidden rounded-lg border border-ds-border bg-black">
            {pendingFile?.type === 'application/pdf' ? (
              <div className="flex items-center gap-3 p-6 text-sm text-ds-text-muted">
                <FileText className="h-8 w-8 shrink-0 text-primary" />
                <span>PDF selected — {formatSize(pendingFile.size)}</span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Preview of the identity document you are about to send"
                className="block max-h-[320px] w-full object-contain"
              />
            )}
          </div>
          <p className="mt-2 text-xs text-ds-text-muted">
            Readable? {pendingFile ? formatSize(pendingFile.size) : ''} — nothing is sent until you
            confirm.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={upload} disabled={busy} className={solid}>
              <Check className="h-4 w-4" />
              {busy ? 'Uploading…' : 'Use this photo'}
            </button>
            <button type="button" onClick={cancel} disabled={busy} className={outline}>
              <RotateCcw className="h-4 w-4" />
              Retake
            </button>
          </div>
        </div>
      )}

      {mode === 'idle' && onFile && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-[#E7ECF2]">Document on file</p>
              <p className="text-xs text-ds-text-muted">
                {labelFor(onFile.mimeType)} · {formatSize(onFile.size)} ·{' '}
                {new Date(onFile.uploadedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button type="button" onClick={remove} disabled={busy} className={outline}>
            <Trash2 className="h-4 w-4" />
            {busy ? 'Removing…' : 'Replace'}
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="mt-3 rounded-lg border border-[var(--ds-value-negative)]/40 bg-[var(--ds-value-negative)]/10 px-3 py-2 text-sm text-[var(--ds-value-negative)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function labelFor(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  return mimeType.replace('image/', '').toUpperCase();
}
