'use client';

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';

interface YieldOpportunity {
  id: string;
  protocol: string;
  chain: string;
  apy: number;
  tvl: string;
  risk: 'Low' | 'Medium' | 'High';
}

export default function YieldPage() {
  const [opportunities, setOpportunities] = useState<YieldOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/yield')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setOpportunities(data))
      .catch(() => setOpportunities([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Yield Intelligence"
        description="Cross-chain yield opportunities ranked by APY and risk."
      />

      {loading ? (
        <p className="text-sm text-[#8B95A5]">Loading yield opportunities...</p>
      ) : opportunities.length === 0 ? (
        <div className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-10 text-center">
          <Zap className="mx-auto mb-3 h-8 w-8 text-[#4b5563]" />
          <p className="text-sm text-[#8B95A5]">No yield opportunities are available yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#212A35]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#212A35] bg-[#17202e]/60 text-left">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8B95A5]">
                  Protocol
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8B95A5] sm:table-cell">
                  Chain
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8B95A5] md:table-cell">
                  Risk
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8B95A5]">
                  APY
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#8B95A5] lg:table-cell">
                  TVL
                </th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-b border-[#212A35]/60 hover:bg-[#17202e]/40 transition-colors ${
                    i % 2 === 0 ? 'bg-[#122131]/30' : 'bg-transparent'
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-[#1E63FF]" />
                      <span className="font-medium text-white">{row.protocol}</span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3.5 text-[#8B95A5] sm:table-cell">{row.chain}</td>
                  <td className="hidden px-4 py-3.5 text-[#8B95A5] md:table-cell">{row.risk}</td>
                  <td className="px-4 py-3.5 font-mono font-semibold text-[#4ADE80]">{row.apy}%</td>
                  <td className="hidden px-4 py-3.5 font-mono text-[#8B95A5] lg:table-cell">
                    {row.tvl}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
