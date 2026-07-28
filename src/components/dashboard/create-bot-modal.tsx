'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

const BOT_TYPES = ['Grid', 'DCA', 'Arbitrage', 'Trailing Stop'] as const;

interface CreateBotModalProps {
  onClose: () => void;
}

export function CreateBotModal({ onClose }: CreateBotModalProps) {
  const { addBot, addToast, walletBalance } = useAppStore();
  const [type, setType] = useState<(typeof BOT_TYPES)[number]>('Grid');
  const [pair, setPair] = useState('');
  const [confidence, setConfidence] = useState(70);
  const [allocatedAmount, setAllocatedAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pair.trim()) {
      setError('Enter a trading pair, e.g. BTC/USDT');
      return;
    }

    const amount = Number(allocatedAmount);
    if (!allocatedAmount || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount of capital to allocate');
      return;
    }
    if (amount > walletBalance) {
      setError(
        `Insufficient wallet balance — available: $${walletBalance.toLocaleString()}. Deposit more funds first.`
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await addBot({
        type,
        pair: pair.trim(),
        confidence,
        status: 'running',
        allocatedAmount: amount,
      });
      addToast('Signal flow created', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create signal flow');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#212A35] bg-[#0D131C] p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">New Signal Flow</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded text-[#8B95A5] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D131C]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 uppercase tracking-wide">
              Strategy
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as (typeof BOT_TYPES)[number])}
              className="w-full rounded-lg border border-[#212A35] bg-[#122131] px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {BOT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 uppercase tracking-wide">
              Trading pair
            </label>
            <input
              type="text"
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              placeholder="BTC/USDT"
              className="w-full rounded-lg border border-[#212A35] bg-[#122131] px-3 py-2.5 text-sm text-white placeholder-[#4b5563] focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 uppercase tracking-wide">
              Allocated capital (USD) — available: ${walletBalance.toLocaleString()}
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={allocatedAmount}
              onChange={(e) => setAllocatedAmount(e.target.value)}
              placeholder="1000"
              className="w-full rounded-lg border border-[#212A35] bg-[#122131] px-3 py-2.5 text-sm text-white placeholder-[#4b5563] focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#8B95A5] mb-1.5 uppercase tracking-wide">
              Confidence threshold — {confidence}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
              className="w-full accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D131C]"
          >
            {submitting ? 'Creating...' : 'Create Signal Flow'}
          </button>
        </form>
      </div>
    </div>
  );
}
