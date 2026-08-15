'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { X } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useAppStore } from '@/store/app-store';
import { TRADEABLE_SYMBOLS } from '@/lib/coin-symbols';
import { SymbolSelect } from '@/components/ui/SymbolSelect';

const BOT_TYPES = ['Grid', 'DCA', 'Arbitrage', 'Trailing Stop'] as const;

interface CreateBotModalProps {
  onClose: () => void;
}

interface TierSlotInfo {
  tier: string;
  /** null means unlimited (vanguard) - Infinity doesn't survive JSON. */
  slotLimit: number | null;
}

export function CreateBotModal({ onClose }: CreateBotModalProps) {
  const { addBot, addToast, walletBalance, bots } = useAppStore();
  const [type, setType] = useState<(typeof BOT_TYPES)[number]>('Grid');
  const [baseSymbol, setBaseSymbol] = useState('BTC');
  const [quoteSymbol, setQuoteSymbol] = useState('ETH');
  const [confidence, setConfidence] = useState(70);
  const [allocatedAmount, setAllocatedAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tierInfo, setTierInfo] = useState<TierSlotInfo | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // The server enforces the real tier slot cap authoritatively (see
  // POST /api/bots) - this fetch is so the modal can show the limit
  // proactively instead of only surfacing it after a failed submit.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/achievements')
      .then((res) => res.json())
      .then((data: { tier?: string; slotLimit?: number | null }) => {
        if (cancelled || !data.tier) return;
        setTierInfo({ tier: data.tier, slotLimit: data.slotLimit ?? null });
      })
      .catch(() => {
        // Leave tierInfo null - the form still works, the server-side
        // check is still authoritative either way.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const atSlotCap =
    tierInfo != null && tierInfo.slotLimit != null && bots.length >= tierInfo.slotLimit;
  const tierLabel = tierInfo
    ? tierInfo.tier.charAt(0).toUpperCase() + tierInfo.tier.slice(1)
    : null;

  // Durations mirror the ds-dur-slow / ds-dur-exit-slow tokens
  // (src/styles/tailwind.css); see deposit-wallet-modal.tsx for the full
  // rationale. handleClose is used for both the X button and a successful
  // submit, so neither path skips the exit animation.
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

  // Keeps the two sides of the pair from matching: if the newly picked
  // symbol collides with the other side, bump the other side to the next
  // available symbol instead of leaving an invalid "BTC/BTC" pair.
  const handleBaseChange = (symbol: string) => {
    setBaseSymbol(symbol);
    if (symbol === quoteSymbol) {
      setQuoteSymbol(TRADEABLE_SYMBOLS.find((s) => s !== symbol) ?? quoteSymbol);
    }
  };
  const handleQuoteChange = (symbol: string) => {
    setQuoteSymbol(symbol);
    if (symbol === baseSymbol) {
      setBaseSymbol(TRADEABLE_SYMBOLS.find((s) => s !== symbol) ?? baseSymbol);
    }
  };

  const handleClose = () => {
    gsap.to(backdropRef.current, { opacity: 0, duration: 0.23 });
    gsap.to(cardRef.current, { opacity: 0, scale: 0.95, y: 8, duration: 0.23, ease: 'power2.in' });
    setTimeout(onClose, 230);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pair = `${baseSymbol}/${quoteSymbol}`;

    const amount = Number(allocatedAmount);
    if (!allocatedAmount || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount of capital to allocate');
      return;
    }
    if (amount > walletBalance) {
      setError(
        `Insufficient wallet balance. Available: $${walletBalance.toLocaleString()}. Deposit more funds first.`
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await addBot({
        type,
        pair,
        confidence,
        status: 'running',
        allocatedAmount: amount,
      });
      addToast('Signal flow created', 'success');
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create signal flow');
      setSubmitting(false);
    }
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div ref={backdropRef} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={cardRef}
        className="relative z-10 w-full max-w-sm rounded-xl border border-ds-border bg-ds-surface-overlay p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ds-text">New Signal Flow</h2>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-ds-text-muted hover:text-ds-text transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-overlay"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {atSlotCap ? (
          <div className="space-y-4">
            <p className="text-sm text-ds-text leading-relaxed">
              Your <span className="font-semibold text-ds-text">{tierLabel}</span> tier allows up to{' '}
              {tierInfo!.slotLimit} active signal flow{tierInfo!.slotLimit === 1 ? '' : 's'}, and
              you&apos;re using all of them. Upgrade your tier by depositing more to unlock
              additional slots.
            </p>
            <Link
              href="/tiers"
              className="block w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-overlay"
            >
              View tiers
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {tierLabel && (
              <p className="text-xs text-ds-text-muted">
                {bots.length} of {tierInfo?.slotLimit ?? '∞'} signal flows used ·{' '}
                <span className="font-medium text-ds-text">{tierLabel}</span> tier
              </p>
            )}
            <div>
              <label className="block text-xs font-semibold text-ds-text-muted mb-1.5 uppercase tracking-wide">
                Strategy
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as (typeof BOT_TYPES)[number])}
                className="w-full rounded-lg border border-ds-border bg-ds-surface-raised px-3 py-2.5 text-sm text-ds-text transition-colors duration-fast ease-ds-out focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {BOT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ds-text-muted mb-1.5 uppercase tracking-wide">
                Trading pair
              </label>
              <div className="flex items-center gap-2">
                <SymbolSelect
                  value={baseSymbol}
                  onChange={handleBaseChange}
                  options={TRADEABLE_SYMBOLS}
                  excludeValue={quoteSymbol}
                  ariaLabel="Base asset"
                />
                <span className="text-ds-text-muted">/</span>
                <SymbolSelect
                  value={quoteSymbol}
                  onChange={handleQuoteChange}
                  options={TRADEABLE_SYMBOLS}
                  excludeValue={baseSymbol}
                  ariaLabel="Quote asset"
                />
              </div>
              <p className="mt-1.5 text-xs text-ds-text-muted">
                Two different assets, both resolved to live CoinGecko price data.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ds-text-muted mb-1.5 uppercase tracking-wide">
                Allocated capital (USD). Available: ${walletBalance.toLocaleString()}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={allocatedAmount}
                onChange={(e) => setAllocatedAmount(e.target.value)}
                placeholder="1000"
                className="w-full rounded-lg border border-ds-border bg-ds-surface-raised px-3 py-2.5 text-sm text-ds-text placeholder-ds-text-muted transition-colors duration-fast ease-ds-out focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ds-text-muted mb-1.5 uppercase tracking-wide">
                Confidence threshold: {confidence}%
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

            {error && <p className="text-xs text-ds-value-negative">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface-overlay"
            >
              {submitting ? 'Creating...' : 'Create Signal Flow'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
