'use client';

import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { RollingNumber, useLiveDrift } from '@/components/ui/RollingNumber';

/**
 * Illustrative network-overview table (the metrics are decorative, same
 * spirit as this page's static chart bars - not a live feed). Each metric
 * drifts independently on an interval so the table reads as "live" rather
 * than a frozen screenshot, per the request to make the numbers rotate.
 *
 * `coingeckoId` is the real CoinGecko coin id used to fetch that network's
 * actual logo (see fetchNetworkIcons below) - purely for the image, never
 * rendered as a link out to CoinGecko. Base has no id: it isn't itself a
 * token (its gas token is ETH), so there's no CoinGecko coin that honestly
 * represents it - it falls back to the colored monogram below instead of
 * guessing at an unrelated listing.
 */
const NETWORKS = [
  {
    name: 'Ethereum',
    symbol: 'Ξ',
    color: '#627EEA',
    coingeckoId: 'ethereum',
    tvl: 12_400_000,
    vaults: 612,
    managers: 401,
    managerFees: 148_200,
    daoFees: 16_450,
  },
  {
    name: 'Arbitrum',
    symbol: 'A',
    color: '#28A0F0',
    coingeckoId: 'arbitrum',
    tvl: 8_150_000,
    vaults: 447,
    managers: 288,
    managerFees: 96_300,
    daoFees: 10_680,
  },
  {
    name: 'Base',
    symbol: 'B',
    color: '#0052FF',
    coingeckoId: null,
    tvl: 6_720_000,
    vaults: 389,
    managers: 255,
    managerFees: 81_500,
    daoFees: 9_040,
  },
  {
    name: 'Optimism',
    symbol: 'O',
    color: '#FF0420',
    coingeckoId: 'optimism',
    tvl: 3_980_000,
    vaults: 231,
    managers: 162,
    managerFees: 47_900,
    daoFees: 5_320,
  },
  {
    name: 'Polygon',
    symbol: 'P',
    color: '#8247E5',
    coingeckoId: 'matic-network',
    tvl: 2_260_000,
    vaults: 198,
    managers: 121,
    managerFees: 29_400,
    daoFees: 3_260,
  },
  {
    name: 'Solana',
    symbol: 'S',
    color: '#14F195',
    coingeckoId: 'solana',
    tvl: 1_540_000,
    vaults: 134,
    managers: 87,
    managerFees: 19_800,
    daoFees: 2_200,
  },
];

const currency = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const plain = (n: number) => Math.round(n).toLocaleString('en-US');

function useNetworkIcons(): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = NETWORKS.map((n) => n.coingeckoId).filter((id): id is string => !!id);
    let cancelled = false;

    fetch(`/api/prices/icons?ids=${ids.join(',')}`)
      .then((res) => res.json())
      .then((data: Record<string, { image: string; symbol: string }>) => {
        if (cancelled) return;
        const byId: Record<string, string> = {};
        for (const [id, coin] of Object.entries(data)) {
          byId[id] = coin.image;
        }
        setIcons(byId);
      })
      .catch(() => {
        // Leave icons empty - NetworkBadge falls back to the colored monogram.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return icons;
}

function NetworkBadge({
  symbol,
  color,
  iconUrl,
}: {
  symbol: string;
  color: string;
  iconUrl?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  if (iconUrl && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small decorative icon, not worth a remotePatterns config change
      <img
        src={iconUrl}
        alt=""
        aria-hidden
        className="h-5 w-5 shrink-0 rounded-full"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {symbol}
    </span>
  );
}

function LiveMetric({
  base,
  format,
  driftPct = 0.006,
}: {
  base: number;
  format: (n: number) => string;
  driftPct?: number;
}) {
  const value = useLiveDrift(base, driftPct);
  return <RollingNumber value={value} format={format} />;
}

const TABS = ['Protocol Overview', 'Treasury Overview', 'Available Assets'] as const;
type Tab = (typeof TABS)[number];

export function ProtocolOverviewTable() {
  const [tab, setTab] = useState<Tab>('Protocol Overview');
  const [includeNested, setIncludeNested] = useState(true);
  const icons = useNetworkIcons();

  const nestedFactor = includeNested ? 1 : 0.82;
  const totalTvl = NETWORKS.reduce((sum, n) => sum + n.tvl, 0) * nestedFactor;
  const totalVaults = NETWORKS.reduce((sum, n) => sum + n.vaults, 0);
  const totalManagers = NETWORKS.reduce((sum, n) => sum + n.managers, 0);
  const totalManagerFees = NETWORKS.reduce((sum, n) => sum + n.managerFees, 0);
  const totalDaoFees = NETWORKS.reduce((sum, n) => sum + n.daoFees, 0);

  return (
    <div>
      <div className="inline-flex items-center gap-1 rounded-full border border-[#212A35] bg-[#122131]/60 p-1 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              tab === t ? 'bg-primary text-primary-foreground' : 'text-[#8B95A5] hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Protocol Overview' ? (
        <>
          <div className="mb-4 flex items-center gap-2 text-sm text-[#E7ECF2]">
            <span>Show TVL with vaults in vaults</span>
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#212A35] text-[#8B95A5]"
              title="Some vaults invest in other vaults. Toggle off to remove that nested exposure from the totals below."
            >
              <HelpCircle className="h-3 w-3" />
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={includeNested}
              onClick={() => setIncludeNested((v) => !v)}
              className={`ml-2 inline-flex h-5 w-9 items-center rounded-full transition-colors duration-base ease-ds-out ${
                includeNested ? 'bg-primary/70 justify-end' : 'bg-[#212A35] justify-start'
              } px-0.5`}
            >
              <span className="h-4 w-4 rounded-full bg-white" />
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#212A35] bg-[#122131]/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#212A35] text-left text-xs uppercase tracking-wider text-[#8B95A5]">
                  <th className="px-5 py-4 font-medium">Network</th>
                  <th className="px-5 py-4 font-medium">Total Value Locked</th>
                  <th className="px-5 py-4 font-medium">Vaults</th>
                  <th className="px-5 py-4 font-medium">Managers</th>
                  <th className="px-5 py-4 font-medium">Manager Fees</th>
                  <th className="px-5 py-4 font-medium">DAO Fees</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#212A35]">
                <tr className="font-semibold text-white">
                  <td className="px-5 py-4">Total</td>
                  <td className="px-5 py-4 font-mono text-primary">
                    <RollingNumber value={totalTvl} format={currency} />
                  </td>
                  <td className="px-5 py-4 font-mono">
                    <RollingNumber value={totalVaults} format={plain} />
                  </td>
                  <td className="px-5 py-4 font-mono">
                    <RollingNumber value={totalManagers} format={plain} />
                  </td>
                  <td className="px-5 py-4 font-mono">
                    <RollingNumber value={totalManagerFees} format={currency} />
                  </td>
                  <td className="px-5 py-4 font-mono">
                    <RollingNumber value={totalDaoFees} format={currency} />
                  </td>
                </tr>
                {NETWORKS.map((n) => (
                  <tr key={n.name} className="text-[#E7ECF2]">
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2">
                        <NetworkBadge
                          symbol={n.symbol}
                          color={n.color}
                          iconUrl={n.coingeckoId ? icons[n.coingeckoId] : undefined}
                        />
                        {n.name}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-mono text-primary">
                      <LiveMetric base={n.tvl * nestedFactor} format={currency} />
                    </td>
                    <td className="px-5 py-4 font-mono">
                      <LiveMetric base={n.vaults} format={plain} driftPct={0.01} />
                    </td>
                    <td className="px-5 py-4 font-mono">
                      <LiveMetric base={n.managers} format={plain} driftPct={0.01} />
                    </td>
                    <td className="px-5 py-4 font-mono">
                      <LiveMetric base={n.managerFees} format={currency} />
                    </td>
                    <td className="px-5 py-4 font-mono">
                      <LiveMetric base={n.daoFees} format={currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-[#212A35] bg-[#122131]/50 p-10 text-center">
          <p className="text-sm text-[#8B95A5]">{tab} is coming in a future release.</p>
        </div>
      )}
    </div>
  );
}
