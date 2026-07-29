'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store/app-store';
import ButtonShimmer from '@/components/ui/button-shimmer';

interface DepositVaultModalProps {
  vaultId: string;
  vaultName: string;
  apy: number;
  onClose: () => void;
}

export function DepositVaultModal({ vaultId, vaultName, apy, onClose }: DepositVaultModalProps) {
  const { addVaultInvestment, addToast } = useAppStore();
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  // Play the exit animation, then unmount after it's had time to finish.
  // A plain timer (not the animation's own completion callback) so closing
  // never depends on the browser actually painting the transition.
  const handleClose = () => {
    setOpen(false);
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
      await addVaultInvestment(vaultId, parsed);
      addToast(`Deposited into ${vaultName}`, 'success');
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deposit');
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm overflow-hidden rounded-xl border border-[#212A35] bg-[#0D131C] p-6"
          >
            <div className="pointer-events-none absolute -top-16 left-1/2 h-32 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Deposit into {vaultName}</h2>
                <p className="mt-0.5 text-xs text-[#8B95A5]">{apy}% APY</p>
              </div>
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
                className="relative w-full overflow-hidden rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-[#F2F5FA] hover:bg-[#3D77FF] disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D131C]"
              >
                {!submitting && <ButtonShimmer />}
                {submitting ? 'Depositing...' : 'Deposit'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
