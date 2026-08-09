'use client';

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Skeleton } from '@/components/ui/Skeleton';

interface YieldOpportunity {
  id: string;
  protocol: string;
  chain: string;
  apy: number;
  tvl: string | null;
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
        <div className="overflow-hidden rounded-xl border border-ds-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ds-border bg-ds-surface-inset/60 text-left">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  Protocol
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted sm:table-cell">
                  Chain
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted md:table-cell">
                  Risk
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  APY
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted lg:table-cell">
                  TVL
                </th>
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr
                  key={i}
                  className={`border-b border-ds-border/60 ${i % 2 === 0 ? 'bg-ds-surface-raised/30' : 'bg-transparent'}`}
                >
                  <td className="px-4 py-3.5">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="hidden px-4 py-3.5 sm:table-cell">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="hidden px-4 py-3.5 md:table-cell">
                    <Skeleton className="h-4 w-12" />
                  </td>
                  <td className="px-4 py-3.5">
                    <Skeleton className="h-4 w-10" />
                  </td>
                  <td className="hidden px-4 py-3.5 lg:table-cell">
                    <Skeleton className="h-4 w-14" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="rounded-xl border border-ds-border bg-ds-surface-raised/50 p-10 text-center">
          <Zap className="mx-auto mb-3 h-8 w-8 text-ds-text-muted" />
          <p className="text-sm text-ds-text-muted">No yield opportunities are available yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ds-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ds-border bg-ds-surface-inset/60 text-left">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  Protocol
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted sm:table-cell">
                  Chain
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted md:table-cell">
                  Risk
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted">
                  APY
                </th>
                <th className="hidden px-4 py-3 text-xs font-medium uppercase tracking-wider text-ds-text-muted lg:table-cell">
                  TVL
                </th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-b border-ds-border/60 hover:bg-ds-surface-inset/40 transition-colors ${
                    i % 2 === 0 ? 'bg-ds-surface-raised/30' : 'bg-transparent'
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="font-medium text-ds-text">{row.protocol}</span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3.5 text-ds-text-muted sm:table-cell">
                    {row.chain}
                  </td>
                  <td className="hidden px-4 py-3.5 text-ds-text-muted md:table-cell">
                    {row.risk}
                  </td>
                  <td className="px-4 py-3.5 font-mono font-semibold text-ds-value-positive">
                    {row.apy}%
                  </td>
                  <td className="hidden px-4 py-3.5 font-mono text-ds-text-muted lg:table-cell">
                    {row.tvl ?? '—'}
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
