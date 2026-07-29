'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAppStore } from '@/store/app-store';
import ButtonShimmer from '@/components/ui/button-shimmer';

interface DepositWalletModalProps {
  onClose: () => void;
}

export function DepositWalletModal({ onClose }: DepositWalletModalProps) {
  const { depositToWallet, addToast } = useAppStore();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.fromTo(backdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, scale: 0.95, y: 8 },
        { opacity: 1, scale: 1, y: 0, duration: 0.2, ease: 'power2.out' }
      );
    },
    { scope: containerRef }
  );

  // Plays the exit animation, then calls onClose via a plain timer rather
  // than the tween's onComplete callback - onComplete depends on GSAP's
  // ticker actually advancing, and decoupling the close signal from that
  // means the modal can never get stuck open if a frame never gets painted.
  const handleClose = () => {
    gsap.to(backdropRef.current, { opacity: 0, duration: 0.2 });
    gsap.to(cardRef.current, {
      opacity: 0,
      scale: 0.95,
      y: 8,
      duration: 0.2,
      ease: 'power2.in',
    });
    setTimeout(onClose, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(amount);
    if (!amount || parsed <= 0) {
      setError('Enter an amount greater than 0');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await depositToWallet(parsed);
      addToast(`Deposited $${parsed.toLocaleString()} to your wallet`, 'success');
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deposit');
      setSubmitting(false);
    }
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div ref={backdropRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={cardRef}
        className="relative z-10 w-full max-w-sm overflow-hidden rounded-xl border border-[#212A35] bg-[#0D131C] p-6"
      >
        <div className="pointer-events-none absolute -top-16 left-1/2 h-32 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Deposit funds</h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded text-[#8B95A5] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D131C]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 uppercase tracking-wide">
              Amount (USD)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              className="w-full rounded-lg border border-[#212A35] bg-[#122131] px-3 py-2.5 text-sm text-white placeholder-[#4b5563] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:shadow-[0_0_16px_-2px_rgba(30,99,255,0.45)] transition-all duration-300"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="relative w-full overflow-hidden rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D131C]"
          >
            {!submitting && <ButtonShimmer />}
            {submitting ? 'Depositing...' : 'Deposit'}
          </button>
        </form>
      </div>
    </div>
  );
}
