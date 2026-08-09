'use client';

import { useRef } from 'react';
import { X } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { AegisMark } from '@/components/ui/AegisLogo';

interface CertificateModalProps {
  name: string;
  achievementName: string;
  earnedAt: string;
  onClose: () => void;
}

export function CertificateModal({
  name,
  achievementName,
  earnedAt,
  onClose,
}: CertificateModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Durations mirror the ds-dur-slow / ds-dur-exit-slow tokens
  // (src/styles/tailwind.css); see deposit-wallet-modal.tsx for the full
  // rationale.
  useGSAP(
    () => {
      gsap.fromTo(backdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.38 });
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, scale: 0.95, y: 8 },
        { opacity: 1, scale: 1, y: 0, duration: 0.38, ease: 'power3.out' }
      );
    },
    { scope: containerRef }
  );

  const handleClose = () => {
    gsap.to(backdropRef.current, { opacity: 0, duration: 0.23 });
    gsap.to(cardRef.current, { opacity: 0, scale: 0.95, y: 8, duration: 0.23, ease: 'power2.in' });
    setTimeout(onClose, 230);
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div ref={backdropRef} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        ref={cardRef}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-primary/30 bg-ds-surface-overlay p-10 text-center shadow-2xl"
      >
        <button
          onClick={handleClose}
          aria-label="Close certificate"
          className="absolute right-4 top-4 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-overlay"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 flex items-center justify-center gap-2">
          <AegisMark size={28} />
          <span className="font-wordmark text-lg font-extrabold uppercase tracking-[0.12em] text-ds-text">
            AEGIS
          </span>
        </div>

        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-ds-text-muted">
          Certificate of Achievement
        </p>
        <p className="mb-6 text-sm text-ds-text-muted">This certifies that</p>
        <h2 className="mb-6 text-2xl font-bold text-ds-text">{name}</h2>
        <p className="mb-2 text-sm text-ds-text-muted">has achieved</p>
        <h3 className="mb-6 text-xl font-semibold text-primary">{achievementName}</h3>
        <p className="text-xs text-ds-text-muted">
          {new Date(earnedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>
    </div>
  );
}
