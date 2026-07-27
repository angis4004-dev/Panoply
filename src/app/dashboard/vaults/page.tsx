'use client';

import { useEffect, useState } from 'react';
import { Shield, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { DepositVaultModal } from '@/components/dashboard/deposit-vault-modal';
import { useAppStore } from '@/store/app-store';

interface VaultCatalogEntry {
  id: string;
  name: string;
  strategy: string;
  risk: 'Low' | 'Medium' | 'High';
  managerScore: number;
  tvl: string;
  apy: number;
}

export default function VaultsPage() {
  const { vaultInvestments, vaultInvestmentsLoading, addToast } = useAppStore();
  const [vaults, setVaults] = useState<VaultCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [depositTarget, setDepositTarget] = useState<VaultCatalogEntry | null>(null);

  useEffect(() => {
    fetch('/api/vaults')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setVaults(data))
      .catch(() => setVaults([]))
      .finally(() => setCatalogLoading(false));
  }, []);

  const loading = catalogLoading || vaultInvestmentsLoading;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Vaults"
        description="Invest in tokenized strategies with transparent performance tracking."
      />

      {loading ? (
        <p className="text-sm text-[#8B95A5]">Loading vaults...</p>
      ) : vaults.length === 0 ? (
        <div className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-10 text-center">
          <Shield className="mx-auto mb-3 h-8 w-8 text-[#4b5563]" />
          <p className="text-sm text-[#8B95A5]">No vaults are available yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vaults.map((vault) => {
            const investment = vaultInvestments.find((inv) => inv.vaultId === vault.id);
            const deposited = investment ? `$${investment.investedAmount.toLocaleString()}` : '$0';

            return (
              <div
                key={vault.id}
                className="flex flex-col gap-4 rounded-xl border border-[#212A35] bg-[#122131]/50 p-5 sm:flex-row sm:items-center sm:justify-between hover:border-[#1E63FF]/25 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#1E63FF]/10">
                    <Shield className="h-5 w-5 text-[#1E63FF]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{vault.name}</h3>
                    <p className="text-xs text-[#8B95A5]">
                      TVL {vault.tvl} · Risk {vault.risk}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 sm:gap-10">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#8B95A5]">APY</p>
                    <p className="font-mono text-lg font-bold text-[#4ADE80]">{vault.apy}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#8B95A5]">
                      Your deposit
                    </p>
                    <p className="font-mono font-semibold text-white">{deposited}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (investment) {
                        addToast(
                          'Managing an existing position is coming soon — reach out to support for now.',
                          'info'
                        );
                        return;
                      }
                      setDepositTarget(vault);
                    }}
                    className="rounded-lg border border-[#1E63FF]/40 px-4 py-2 text-sm font-medium text-[#1E63FF] hover:bg-[#1E63FF]/10 transition-colors"
                  >
                    {investment ? 'Manage' : 'Deposit'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex items-center gap-3 rounded-xl border border-[#212A35] bg-[#17202e]/40 p-4">
        <TrendingUp className="h-5 w-5 shrink-0 text-[#1E63FF]" />
        <p className="text-sm text-[#8B95A5]">
          Vault shares are tokenized on-chain. Performance is updated in real time from protocol
          data.
        </p>
      </div>

      {depositTarget && (
        <DepositVaultModal
          vaultId={depositTarget.id}
          vaultName={depositTarget.name}
          apy={depositTarget.apy}
          onClose={() => setDepositTarget(null)}
        />
      )}
    </div>
  );
}
