'use client';

import { useState, useEffect } from 'react';
import { Calculator, DollarSign, Sprout, TrendingUp, X } from 'lucide-react';
import { RiskBadge } from '@/components/dashboard/risk-badge';
import type { YieldRisk } from '@/lib/defillama';

export interface YieldPoolItem {
  id: string;
  protocol: string;
  chain: string;
  symbol: string;
  apy: number;
  tvlUsd: number;
  risk: YieldRisk;
}

interface YieldCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: YieldPoolItem | null;
}

const PRESET_AMOUNTS = [500, 1000, 5000, 10000, 25000];

export function YieldCalculatorModal({ isOpen, onClose, pool }: YieldCalculatorModalProps) {
  const [amount, setAmount] = useState<number>(1000);
  const [compoundFreq, setCompoundFreq] = useState<'daily' | 'weekly' | 'monthly' | 'annually'>(
    'daily'
  );

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !pool) return null;

  const apyRate = Math.max(0, pool.apy) / 100;
  const n =
    compoundFreq === 'daily'
      ? 365
      : compoundFreq === 'weekly'
        ? 52
        : compoundFreq === 'monthly'
          ? 12
          : 1;

  const calculateReturn = (days: number) => {
    const years = days / 365;
    const total = amount * Math.pow(1 + apyRate / n, n * years);
    const profit = Math.max(0, total - amount);
    return { total, profit };
  };

  const dailyProfit = (amount * apyRate) / 365;
  const return30d = calculateReturn(30);
  const return90d = calculateReturn(90);
  const return365d = calculateReturn(365);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-fast"
      />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-ds-border bg-ds-surface-overlay p-5 sm:p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-ds-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ds-text">Compound Yield Calculator</h2>
              <p className="text-xs text-ds-text-muted">
                Project returns for {pool.protocol} ({pool.symbol})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calculator"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ds-text-muted transition-colors duration-fast [@media(hover:hover)_and_(pointer:fine)]:hover:bg-ds-surface-inset [@media(hover:hover)_and_(pointer:fine)]:hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selected Pool Details */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ds-border/70 bg-ds-surface-raised/40 p-3">
          <div className="flex items-center gap-2">
            <Sprout className="h-4 w-4 text-primary" />
            <div>
              <span className="text-sm font-semibold text-ds-text">{pool.protocol}</span>
              <span className="ml-1.5 text-xs text-ds-text-muted">({pool.chain})</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RiskBadge risk={pool.risk} />
            <span className="font-mono text-sm font-bold text-ds-value-positive">
              {pool.apy.toFixed(2)}% APY
            </span>
          </div>
        </div>

        {/* Deposit Capital Input */}
        <div className="mt-4">
          <label
            htmlFor="deposit-amount"
            className="block text-xs font-medium text-ds-text-secondary"
          >
            Projected Principal ($ USD)
          </label>
          <div className="relative mt-1.5 flex items-center">
            <DollarSign className="absolute left-3 h-4 w-4 text-ds-text-muted" />
            <input
              id="deposit-amount"
              type="number"
              min="1"
              max="10000000"
              value={amount || ''}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="w-full rounded-xl border border-ds-border bg-ds-surface-raised py-2.5 pl-9 pr-4 font-mono text-sm text-ds-text transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="1000"
            />
          </div>

          {/* Quick Preset Buttons */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESET_AMOUNTS.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(val)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  amount === val
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-ds-border text-ds-text-muted hover:border-ds-border-strong hover:text-ds-text'
                }`}
              >
                ${val.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Compounding Frequency Selector */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-ds-text-secondary">
            Compounding Schedule
          </label>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {(['daily', 'weekly', 'monthly', 'annually'] as const).map((freq) => (
              <button
                key={freq}
                type="button"
                onClick={() => setCompoundFreq(freq)}
                className={`rounded-lg border py-1.5 text-center text-xs font-medium capitalize transition-colors ${
                  compoundFreq === freq
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-ds-border text-ds-text-muted hover:border-ds-border-strong hover:text-ds-text'
                }`}
              >
                {freq}
              </button>
            ))}
          </div>
        </div>

        {/* Projected Returns Summary Grid */}
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-ds-border bg-ds-surface-raised/40 p-3 text-center">
            <span className="text-[11px] font-medium text-ds-text-muted">Daily Est.</span>
            <div className="mt-1 font-mono text-xs font-semibold text-ds-value-positive">
              +${dailyProfit.toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl border border-ds-border bg-ds-surface-raised/40 p-3 text-center">
            <span className="text-[11px] font-medium text-ds-text-muted">30 Days</span>
            <div className="mt-1 font-mono text-xs font-semibold text-ds-value-positive">
              +${return30d.profit.toFixed(2)}
            </div>
            <div className="text-[10px] text-ds-text-muted">
              ${return30d.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="rounded-xl border border-ds-border bg-ds-surface-raised/40 p-3 text-center">
            <span className="text-[11px] font-medium text-ds-text-muted">90 Days</span>
            <div className="mt-1 font-mono text-xs font-semibold text-ds-value-positive">
              +${return90d.profit.toFixed(2)}
            </div>
            <div className="text-[10px] text-ds-text-muted">
              ${return90d.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-center">
            <span className="text-[11px] font-medium text-primary">1 Year</span>
            <div className="mt-1 font-mono text-xs font-bold text-ds-value-positive">
              +${return365d.profit.toFixed(2)}
            </div>
            <div className="text-[10px] text-ds-text-muted">
              ${return365d.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* Total Projected ROI Highlight */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-ds-border bg-ds-surface-raised p-3.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-ds-text-secondary">
              1-Year Total Compounded:
            </span>
          </div>
          <span className="font-mono text-sm font-bold text-ds-text">
            $
            {return365d.total.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        {/* Disclosure */}
        <p className="mt-3 text-[11px] leading-relaxed text-ds-text-muted">
          Estimates are mathematical projections based on currently reported DefiLlama pool rates.
          Rates fluctuate with market liquidity and are not guaranteed returns by Panoply.
        </p>
      </div>
    </div>
  );
}
