'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deposit');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#212A35] bg-[#0D131C] p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Deposit into {vaultName}</h2>
            <p className="mt-0.5 text-xs text-[#8B95A5]">{apy}% APY</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8B95A5] hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              className="w-full rounded-lg border border-[#212A35] bg-[#122131] px-3 py-2.5 text-sm text-white placeholder-[#4b5563] focus:outline-none focus:ring-2 focus:ring-[#1E63FF]/50"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#1E63FF] px-4 py-2.5 text-sm font-semibold text-[#F2F5FA] hover:bg-[#3D77FF] disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Depositing...' : 'Deposit'}
          </button>
        </form>
      </div>
    </div>
  );
}
