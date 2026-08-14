'use client';

import { useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { GlassCard } from '@/components/ui/glass-card';
import { Send, Plus, X } from 'lucide-react';
import { RiskProfile } from '@/lib/types';

interface FormHolding {
  token: string;
  amount: string;
  price: string;
  chain: string;
}

export default function PortfolioBuilderTab() {
  const { user, addReport, setTab, addToast } = useAppStore();
  const [holdings, setHoldings] = useState<FormHolding[]>([
    { token: '', amount: '', price: '', chain: 'Ethereum' },
  ]);
  const [risk, setRisk] = useState<RiskProfile>('moderate');
  const [horizon, setHorizon] = useState('medium');
  const [targetReturn, setTargetReturn] = useState(15);
  const [maxAllocation, setMaxAllocation] = useState(40);
  const [blacklist, setBlacklist] = useState('');

  const addRow = () => {
    setHoldings([...holdings, { token: '', amount: '', price: '', chain: 'Ethereum' }]);
  };

  const removeRow = (index: number) => {
    setHoldings(holdings.filter((_, i) => i !== index));
  };

  const updateHolding = (index: number, field: keyof FormHolding, value: string) => {
    const updated = [...holdings];
    updated[index][field] = value;
    setHoldings(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prepare form data for API request
    const formData = {
      holdings: holdings.map((h) => ({
        token: h.token,
        amount: h.amount,
        price: h.price,
        chain: h.chain,
      })),
      risk,
      horizon,
      targetReturn,
      maxAllocation,
      blacklist,
      email: user?.email || 'user@example.com',
    };

    try {
      const response = await fetch('/api/portfolio-builder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      const data = await response.json();

      if (data.success && data.report) {
        const {
          holdings: reportHoldings,
          totalValue,
          email,
          riskProfile,
          metrics,
          recommendations,
        } = data.report;
        // /api/reports (the history list) has its own Report shape
        // (title/description/type/status) that's different from the
        // PortfolioReport the builder API returns - map it rather than
        // passing the raw portfolio report straight through, which 400s
        // on missing required fields.
        await addReport({
          title: `Portfolio Report: ${riskProfile} risk`,
          description: `${reportHoldings.length} holding${reportHoldings.length === 1 ? '' : 's'}, $${totalValue.toLocaleString()} analyzed`,
          type: 'portfolio',
          status: data.emailStatus === 'sent' ? 'success' : 'failed',
          metrics,
          holdings: reportHoldings,
          recommendations,
        });
        addToast(
          `Report ready. ${reportHoldings.length} asset${reportHoldings.length === 1 ? '' : 's'}, $${totalValue.toLocaleString()} analyzed, sent to ${email}`,
          'success'
        );
        setTimeout(() => setTab('history'), 1000);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      addToast(error instanceof Error ? error.message : 'Failed to generate report', 'error');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-ds-text mb-2">Portfolio Builder</h2>
        <p className="text-ds-text-muted text-sm">
          Input your holdings and goals. We will generate a comprehensive report and email it to
          you.
        </p>
      </div>
      <GlassCard className="p-8">
        <form onSubmit={handleSubmit}>
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm">
                1
              </div>
              <h3 className="font-semibold text-ds-text">Your Holdings</h3>
            </div>
            {/* Two columns on phones, the full 12-column row only from `sm` up.
                At 375px the twelve-column version gave each field a fraction of
                a 278px row - the chain <select> came out 36px wide, too narrow
                to read a single option, and "Price USD" got 61px. Steps 2 and 3
                below were already responsive; this row was the one that was
                missed. */}
            <div className="space-y-5 sm:space-y-3">
              {holdings.map((h, i) => (
                <div key={i} className="grid grid-cols-2 gap-3 sm:grid-cols-12">
                  {/* Labels are rendered, not implied by placeholder. A
                      placeholder disappears the moment the field has content,
                      so on review the user sees four unlabelled values, and a
                      screen reader gets nothing at all once typing starts. */}
                  <div className="col-span-2 sm:col-span-4">
                    <label
                      htmlFor={`holding-token-${i}`}
                      className="mb-1.5 block text-xs font-medium text-ds-text-muted"
                    >
                      Token
                    </label>
                    <input
                      id={`holding-token-${i}`}
                      type="text"
                      placeholder="e.g. BTC"
                      value={h.token}
                      onChange={(e) => updateHolding(i, 'token', e.target.value)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-lg text-sm bg-ds-surface-raised border border-ds-border text-ds-text placeholder-ds-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-3">
                    <label
                      htmlFor={`holding-amount-${i}`}
                      className="mb-1.5 block text-xs font-medium text-ds-text-muted"
                    >
                      Amount
                    </label>
                    <input
                      id={`holding-amount-${i}`}
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={h.amount}
                      onChange={(e) => updateHolding(i, 'amount', e.target.value)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-lg text-sm bg-ds-surface-raised border border-ds-border text-ds-text placeholder-ds-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                  <div className="col-span-1 sm:col-span-3">
                    <label
                      htmlFor={`holding-price-${i}`}
                      className="mb-1.5 block text-xs font-medium text-ds-text-muted"
                    >
                      Price (USD)
                    </label>
                    <input
                      id={`holding-price-${i}`}
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={h.price}
                      onChange={(e) => updateHolding(i, 'price', e.target.value)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-lg text-sm bg-ds-surface-raised border border-ds-border text-ds-text placeholder-ds-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                      required
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-2">
                    <label
                      htmlFor={`holding-chain-${i}`}
                      className="mb-1.5 block text-xs font-medium text-ds-text-muted"
                    >
                      Chain
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        id={`holding-chain-${i}`}
                        value={h.chain}
                        onChange={(e) => updateHolding(i, 'chain', e.target.value)}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-lg text-sm bg-ds-surface-raised border border-ds-border text-ds-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option>Bitcoin</option>
                        <option>Ethereum</option>
                        <option>Arbitrum</option>
                        <option>Base</option>
                        <option>Solana</option>
                      </select>
                      {holdings.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(i)}
                          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-ds-value-negative hover:text-ds-value-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-value-negative/50"
                          aria-label={`Remove asset ${i + 1}`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="mt-3 flex items-center gap-1 rounded text-sm text-primary hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <Plus className="w-4 h-4" /> Add another asset
            </button>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-brand-purple/15 flex items-center justify-center text-brand-purple font-bold text-sm">
                2
              </div>
              <h3 className="font-semibold text-ds-text">Risk Profile</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-ds-text-muted mb-2 block">
                  How would you describe your risk tolerance?
                </label>
                {/* Stacked on phones. Three across gave each card 85px at
                    375px, and p-4 leaves 51px of that for the label - but
                    "Conservative" needs 96px, so the centred text spilled out
                    of both sides of its card and ran into the next one. */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {(['conservative', 'moderate', 'aggressive'] as RiskProfile[]).map((r) => {
                    const colors: Record<string, string> = {
                      conservative:
                        'peer-checked:border-ds-value-positive peer-checked:bg-ds-value-positive/10',
                      moderate: 'peer-checked:border-primary peer-checked:bg-primary/10',
                      aggressive:
                        'peer-checked:border-brand-purple peer-checked:bg-brand-purple/10',
                    };
                    return (
                      <label key={r} className="cursor-pointer">
                        <input
                          type="radio"
                          name="risk"
                          value={r}
                          checked={risk === r}
                          onChange={() => setRisk(r)}
                          className="peer sr-only"
                        />
                        <div
                          className={`p-4 rounded-lg border border-ds-border text-center transition peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 ${colors[r]}`}
                        >
                          <div className="font-semibold text-sm text-ds-text capitalize">{r}</div>
                          <div className="text-xs text-ds-text-muted mt-1">
                            {r === 'conservative'
                              ? 'Preserve capital'
                              : r === 'moderate'
                                ? 'Balanced growth'
                                : 'Maximize returns'}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <label htmlFor="pb-horizon" className="text-sm text-ds-text-muted mb-2 block">
                  Investment time horizon
                </label>
                <select
                  id="pb-horizon"
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-ds-surface-raised border border-ds-border text-ds-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="short">Short term (&lt; 1 year)</option>
                  <option value="medium">Medium term (1-3 years)</option>
                  <option value="long">Long term (3+ years)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-ds-value-positive/15 flex items-center justify-center text-ds-value-positive font-bold text-sm">
                3
              </div>
              <h3 className="font-semibold text-ds-text">Goals</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pb-target-return" className="text-sm text-ds-text-muted mb-2 block">
                  Target annual return (%)
                </label>
                <input
                  id="pb-target-return"
                  type="number"
                  value={targetReturn}
                  onChange={(e) => setTargetReturn(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-ds-surface-raised border border-ds-border text-ds-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label htmlFor="pb-objective" className="text-sm text-ds-text-muted mb-2 block">
                  Primary objective
                </label>
                <select
                  id="pb-objective"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-ds-surface-raised border border-ds-border text-ds-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="growth">Capital Growth</option>
                  <option value="income">Passive Income</option>
                  <option value="balanced">Balanced</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-ds-value-warning/20 flex items-center justify-center text-ds-value-warning font-bold text-sm">
                4
              </div>
              <h3 className="font-semibold text-ds-text">Constraints</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="pb-max-allocation"
                  className="text-sm text-ds-text-muted mb-2 block"
                >
                  Max allocation per asset (%)
                </label>
                <input
                  id="pb-max-allocation"
                  type="number"
                  value={maxAllocation}
                  onChange={(e) => setMaxAllocation(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-ds-surface-raised border border-ds-border text-ds-text focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label htmlFor="pb-blacklist" className="text-sm text-ds-text-muted mb-2 block">
                  Assets to exclude (comma separated)
                </label>
                <input
                  id="pb-blacklist"
                  type="text"
                  value={blacklist}
                  onChange={(e) => setBlacklist(e.target.value)}
                  placeholder="e.g. SHIB, DOGE"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-ds-surface-raised border border-ds-border text-ds-text placeholder-ds-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-ds-border">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
            >
              <Send className="w-4 h-4" /> Generate & Email Report
            </button>
            <span className="text-xs text-ds-text-muted">
              Report will be sent to{' '}
              <span className="text-ds-text">{user?.email || 'your email'}</span>
            </span>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
