'use client';

import { X } from 'lucide-react';
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-primary/30 bg-[#0D131C] p-10 text-center shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close certificate"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-[#8B95A5] hover:bg-[#17202e] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D131C]"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 flex items-center justify-center gap-2">
          <AegisMark size={28} />
          <span className="font-wordmark text-lg font-extrabold uppercase tracking-[0.12em] text-white">
            AEGIS
          </span>
        </div>

        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[#8B95A5]">
          Certificate of Achievement
        </p>
        <p className="mb-6 text-sm text-[#8B95A5]">This certifies that</p>
        <h2 className="mb-6 text-2xl font-bold text-white">{name}</h2>
        <p className="mb-2 text-sm text-[#8B95A5]">has achieved</p>
        <h3 className="mb-6 text-xl font-semibold text-primary">{achievementName}</h3>
        <p className="text-xs text-[#8B95A5]">
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
