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
        // Add the report to the store (received from API)
        addReport(data.report);
        addToast(`Report generated! Sent to ${data.report.email}`, 'success');
        setTimeout(() => setTab('history'), 1000);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      console.error('Error generating report:', error);
      addToast(error.message || 'Failed to generate report', 'error');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Portfolio Builder</h2>
        <p className="text-slate-400 text-sm">
          Input your holdings and goals. We will generate a comprehensive report and email it to
          you.
        </p>
      </div>
      <GlassCard className="p-8">
        <form onSubmit={handleSubmit}>
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                1
              </div>
              <h3 className="font-semibold text-white">Your Holdings</h3>
            </div>
            <div className="space-y-3">
              {holdings.map((h, i) => (
                <div key={i} className="grid grid-cols-12 gap-3">
                  <div className="col-span-4">
                    <input
                      type="text"
                      placeholder="Token (e.g. BTC)"
                      value={h.token}
                      onChange={(e) => updateHolding(i, 'token', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      placeholder="Amount"
                      value={h.amount}
                      onChange={(e) => updateHolding(i, 'amount', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      placeholder="Price USD"
                      value={h.price}
                      onChange={(e) => updateHolding(i, 'price', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500"
                      required
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <select
                      value={h.chain}
                      onChange={(e) => updateHolding(i, 'chain', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/80 border border-slate-700 text-white"
                    >
                      <option>Ethereum</option>
                      <option>Arbitrum</option>
                      <option>Base</option>
                      <option>Solana</option>
                    </select>
                    {holdings.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="mt-3 text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add another asset
            </button>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-sm">
                2
              </div>
              <h3 className="font-semibold text-white">Risk Profile</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">
                  How would you describe your risk tolerance?
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['conservative', 'moderate', 'aggressive'] as RiskProfile[]).map((r) => {
                    const colors: Record<string, string> = {
                      conservative:
                        'peer-checked:border-emerald-500 peer-checked:bg-emerald-500/10',
                      moderate: 'peer-checked:border-blue-500 peer-checked:bg-blue-500/10',
                      aggressive: 'peer-checked:border-purple-500 peer-checked:bg-purple-500/10',
                    };
                    return (
                      <label key={r} className="cursor-pointer">
                        <input
                          type="radio"
                          name="risk"
                          value={r}
                          checked={risk === r}
                          onChange={() => setRisk(r)}
                          className="peer hidden"
                        />
                        <div
                          className={`p-4 rounded-lg border border-slate-700 text-center transition ${colors[r]}`}
                        >
                          <div className="font-semibold text-sm text-white capitalize">{r}</div>
                          <div className="text-xs text-slate-500 mt-1">
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
                <label className="text-sm text-slate-400 mb-2 block">Investment time horizon</label>
                <select
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/80 border border-slate-700 text-white"
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
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
                3
              </div>
              <h3 className="font-semibold text-white">Goals</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">
                  Target annual return (%)
                </label>
                <input
                  type="number"
                  value={targetReturn}
                  onChange={(e) => setTargetReturn(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/80 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Primary objective</label>
                <select className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/80 border border-slate-700 text-white">
                  <option value="growth">Capital Growth</option>
                  <option value="income">Passive Income</option>
                  <option value="balanced">Balanced</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
                4
              </div>
              <h3 className="font-semibold text-white">Constraints</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">
                  Max allocation per asset (%)
                </label>
                <input
                  type="number"
                  value={maxAllocation}
                  onChange={(e) => setMaxAllocation(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/80 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">
                  Assets to exclude (comma separated)
                </label>
                <input
                  type="text"
                  value={blacklist}
                  onChange={(e) => setBlacklist(e.target.value)}
                  placeholder="e.g. SHIB, DOGE"
                  className="w-full px-4 py-2.5 rounded-lg text-sm bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-slate-800/50">
            <button
              type="submit"
              className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold flex items-center gap-2 hover:from-blue-500 hover:to-purple-500 transition shadow-lg shadow-blue-500/20"
            >
              <Send className="w-4 h-4" /> Generate & Email Report
            </button>
            <span className="text-xs text-slate-500">
              Report will be sent to{' '}
              <span className="text-slate-300">{user?.email || 'your email'}</span>
            </span>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
