'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Cpu,
  DollarSign,
  Activity,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { useCoinPrices, useGlobalMarketData, useTrendingCoins } from '@/lib/hooks/useCoingecko';

type DeltaDir = 'up' | 'down' | 'neutral' | 'warn';

function DeltaBadge({ delta, dir }: { delta: string; dir: DeltaDir }) {
  const styles = {
    up: 'text-teal-400 bg-teal-500/10',
    down: 'text-red-400 bg-red-500/10',
    neutral: 'text-zinc-400 bg-zinc-700/50',
    warn: 'text-amber-400 bg-amber-500/10',
  };
  const icons = {
    up: <TrendingUp size={11} />,
    down: <TrendingDown size={11} />,
    neutral: null,
    warn: <AlertTriangle size={11} />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${styles[dir]}`}
    >
      {icons[dir]}
      {delta}
    </span>
  );
}

export default function MetricsBentoGrid() {
  // Get prices for major cryptocurrencies
  const { prices: btcEthPrices, loading: pricesLoading } = useCoinPrices(['bitcoin', 'ethereum']);

  // Get global market data for overall market performance
  const { globalData, loading: globalLoading } = useGlobalMarketData();

  // Get trending coins for market sentiment
  const { trending, loading: trendingLoading } = useTrendingCoins();

  // Initialize state for all metrics
  const [pnlData, setPnlData] = useState<{ value: string; delta: string; deltaDir: DeltaDir }>({
    value: '+$0.00',
    delta: '0%',
    deltaDir: 'neutral',
  });
  const [winRateData, setWinRateData] = useState<{
    value: string;
    delta: string;
    deltaDir: DeltaDir;
  }>({
    value: '50.0%',
    delta: '0.0pp',
    deltaDir: 'neutral',
  });
  const [confidenceData, setConfidenceData] = useState<{
    value: string;
    delta: string;
    deltaDir: DeltaDir;
  }>({
    value: '0.500',
    delta: '0.000',
    deltaDir: 'neutral',
  });
  const [activePositionData, setActivePositionData] = useState<{
    value: string;
    delta: string;
    deltaDir: DeltaDir;
  }>({
    value: '$0.00',
    delta: 'BTC-USDT',
    deltaDir: 'neutral',
  });
  const [lastSignalData, setLastSignalData] = useState({
    value: 'HOLD',
    confidence: 0.5,
    pair: 'BTC-USDT',
    age: '30s ago',
  });
  const [trades24hData, setTrades24hData] = useState<{
    value: string;
    delta: string;
    deltaDir: DeltaDir;
  }>({
    value: '0',
    delta: '0 vs yesterday',
    deltaDir: 'neutral',
  });
  const [drawdownData, setDrawdownData] = useState<{
    value: string;
    threshold: string;
    deltaDir: DeltaDir;
  }>({
    value: '0%',
    threshold: '5.0%',
    deltaDir: 'neutral',
  });

  useEffect(() => {
    const isMounted = true;

    async function calculateMetrics() {
      try {
        // Calculate P&L based on price changes (simulated portfolio performance)
        let pnlValue = '+$0.00';
        let pnlDelta = '0%';
        let pnlDeltaDir: DeltaDir = 'neutral';

        if (btcEthPrices && Object.keys(btcEthPrices).length > 0 && !pricesLoading) {
          // Simulate a portfolio based on BTC and ETH performance
          // For demo purposes, we'll use price changes to simulate performance
          // In a real app, you'd fetch historical data and calculate actual P&L
          const btcChange = Math.random() * 10 - 5; // Random change between -5% and +5%
          const ethChange = Math.random() * 10 - 5; // Random change between -5% and +5%

          // Weighted average (60% BTC, 40% ETH)
          const portfolioChange = btcChange * 0.6 + ethChange * 0.4;

          const portfolioValue = 10000 * (1 + portfolioChange / 100); // Starting with $10k
          const pnlAmount = portfolioValue - 10000;

          pnlValue =
            pnlAmount >= 0
              ? `+$${pnlAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : `$${pnlAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          pnlDelta = `${Math.abs(Math.round((portfolioChange + Number.EPSILON) * 10) / 10)}%`;
          pnlDeltaDir = parseFloat(pnlDelta) >= 0 ? 'up' : 'down';
        }

        // Calculate win rate based on market conditions
        let winRateValue = '50.0%';
        let winRateDelta = '0.0pp';
        let winRateDeltaDir: DeltaDir = 'neutral';

        if (globalData && !globalLoading) {
          // Use market cap change as a proxy for market sentiment
          const marketChange = globalData.market_cap_change_percentage_24h_usd || 0;
          // Convert market change to win rate (this is a simplification)
          const baseWinRate = 50;
          const adjustedWinRate = Math.min(
            80,
            Math.max(20, Math.round((baseWinRate + marketChange * 0.3) * 10) / 10)
          );
          const prevWinRate = 50 + Math.round((Math.random() * 4 - 2) * 10) / 10; // Slight random variation

          winRateValue = `${adjustedWinRate}%`;
          winRateDelta = `${Math.abs(Math.round((adjustedWinRate - prevWinRate) * 10) / 10)}pp`;
          winRateDeltaDir = adjustedWinRate >= prevWinRate ? 'up' : 'down';
        }

        // Calculate model confidence based on market stability
        let confidenceValue = '0.500';
        let confidenceDelta = '0.000';
        let confidenceDeltaDir: DeltaDir = 'neutral';

        if (globalData && !globalLoading) {
          // Lower volatility = higher confidence
          const volumeChange = Math.abs(globalData.market_cap_change_percentage_24h_usd) || 0;
          const baseConfidence = 0.7;
          const volatilityPenalty = Math.min(0.3, volumeChange / 100); // Reduce confidence with high volatility
          const rawScore = Math.max(
            0.5,
            baseConfidence - volatilityPenalty + (Math.random() * 0.1 - 0.05)
          );
          const confidenceScore = Math.round(rawScore * 1000) / 1000;

          const prevConfidence = Math.round((0.7 + (Math.random() * 0.1 - 0.05)) * 1000) / 1000;

          confidenceValue = `${Math.trunc(confidenceScore * 1000) / 1000}`;
          confidenceDelta = `${Math.trunc((confidenceScore - prevConfidence) * 1000)}`;
          confidenceDeltaDir = parseFloat(confidenceDelta) >= 0 ? 'up' : 'down';
        }

        // Active position: show a major cryptocurrency
        let activePositionValue = '$0.00';
        let activePositionDelta = 'BTC-USDT';
        let activePositionDeltaDir: DeltaDir = 'neutral';

        if (btcEthPrices && Object.keys(btcEthPrices).length > 0 && !pricesLoading) {
          const btcPrice = btcEthPrices.bitcoin?.usd || 0;
          activePositionValue = `$${btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          activePositionDelta = 'BTC-USDT';
          // Simple trend based on price change (would need historical data for real calculation)
          activePositionDeltaDir = Math.random() > 0.5 ? 'up' : 'down';
        }

        // Last signal: based on recent price momentum
        let lastSignalValue = 'HOLD';
        let lastSignalConfidence = 0.5;
        let lastSignalPair = 'BTC-USDT';
        let lastSignalAge = '30s ago';

        if (btcEthPrices && Object.keys(btcEthPrices).length > 0 && !pricesLoading) {
          const btcChange = Math.random() * 10 - 5; // Simulated change
          if (btcChange > 2) {
            lastSignalValue = 'BUY';
            lastSignalConfidence = Math.min(0.95, 0.6 + Math.abs(btcChange) / 20);
          } else if (btcChange < -2) {
            lastSignalValue = 'SELL';
            lastSignalConfidence = Math.min(0.95, 0.6 + Math.abs(btcChange) / 20);
          } else {
            lastSignalValue = 'HOLD';
            lastSignalConfidence = 0.5 + Math.random() * 0.2;
          }
          lastSignalPair = 'BTC-USDT';
          lastSignalAge = `${Math.floor(Math.random() * 60)}s ago`;
        }

        // 24h trades: estimate based on market activity
        let trades24hValue = '0';
        let trades24hDelta = '0 vs yesterday';
        let trades24hDeltaDir: DeltaDir = 'neutral';

        if (globalData && !globalLoading) {
          // Estimate trading volume based on market cap and volatility
          const volumeFactor = (globalData.total_volume.usd || 0) / 1e9; // Volume in billions
          const baseTrades = Math.min(100, Math.max(10, Math.round(volumeFactor * 10)));
          const dailyVariation = Math.round(Math.random() * 20 - 10); // ±10 trades
          const todaysTrades = Math.max(0, Math.round(baseTrades + dailyVariation));
          const yesterdaysTrades = Math.max(0, Math.round(baseTrades + (Math.random() * 20 - 10)));

          trades24hValue = todaysTrades.toString();
          trades24hDelta = `${todaysTrades - yesterdaysTrades} vs yesterday`;
          trades24hDeltaDir = todaysTrades >= yesterdaysTrades ? 'up' : 'down';
        }

        // Drawdown: based on recent market performance
        let drawdownValue = '0%';
        let drawdownDeltaDir: DeltaDir = 'neutral';

        if (globalData && !globalLoading) {
          // Use negative market cap change as drawdown (simplified)
          const marketChange = globalData.market_cap_change_percentage_24h_usd || 0;
          const drawdown = Math.max(0, -Math.round(Math.abs(marketChange) * 10) / 10); // Only show drawdown when negative

          drawdownValue = `${drawdown}%`;
          if (drawdown >= 5) {
            drawdownDeltaDir = 'warn';
          } else if (drawdown > 0) {
            drawdownDeltaDir = 'down';
          } else {
            drawdownDeltaDir = 'neutral';
          }
        }

        if (isMounted) {
          setPnlData({ value: pnlValue, delta: pnlDelta, deltaDir: pnlDeltaDir });
          setWinRateData({ value: winRateValue, delta: winRateDelta, deltaDir: winRateDeltaDir });
          setConfidenceData({
            value: confidenceValue,
            delta: confidenceDelta,
            deltaDir: confidenceDeltaDir,
          });
          setActivePositionData({
            value: activePositionValue,
            delta: activePositionDelta,
            deltaDir: activePositionDeltaDir,
          });
          setLastSignalData({
            value: lastSignalValue,
            confidence: lastSignalConfidence,
            pair: lastSignalPair,
            age: lastSignalAge,
          });
          setTrades24hData({
            value: trades24hValue,
            delta: trades24hDelta,
            deltaDir: trades24hDeltaDir,
          });
          setDrawdownData({ value: drawdownValue, threshold: '5.0%', deltaDir: drawdownDeltaDir });
        }
      } catch (err) {
        console.error('Error calculating metrics:', err);
        // Set fallback values on error
        if (isMounted) {
          setPnlData({ value: '+$0.00', delta: '0%', deltaDir: 'neutral' });
          setWinRateData({ value: '50.0%', delta: '0.0pp', deltaDir: 'neutral' });
          setConfidenceData({ value: '0.500', delta: '0.000', deltaDir: 'neutral' });
          setActivePositionData({ value: '$0.00', delta: 'BTC-USDT', deltaDir: 'neutral' });
          setLastSignalData({ value: 'HOLD', confidence: 0.5, pair: 'BTC-USDT', age: '30s ago' });
          setTrades24hData({ value: '0', delta: '0 vs yesterday', deltaDir: 'neutral' });
          setDrawdownData({ value: '0%', threshold: '5.0%', deltaDir: 'neutral' });
        }
      }
    }

    // Calculate initial metrics
    if (!pricesLoading || !globalLoading || !trendingLoading) {
      calculateMetrics();
    }

    // Set up interval to update every 30 seconds
    const interval = setInterval(calculateMetrics, 30000);
    return () => clearInterval(interval);
  }, [btcEthPrices, pricesLoading, globalData, globalLoading, trending, trendingLoading]);

  // If still loading, show skeleton UI
  if (pricesLoading && globalLoading && trendingLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4 mb-6">
        {/* Skeleton cards */}
        <div className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-500/15 flex items-center justify-center">
                <DollarSign size={16} className="text-teal-400" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Realized P&L
              </span>
            </div>
            <span className="text-[11px] text-zinc-500">Loading...</span>
          </div>
          <h2 className="text-3xl font-bold text-teal-400 font-mono tabular-nums">Loading...</h2>
          <p className="text-xs text-zinc-600">All-time · Loading closed trades · Since Jan 2024</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 animate-pulse col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Target size={16} className="text-zinc-400" />
            </div>
            <span className="text-[11px] text-zinc-500">Loading...</span>
          </div>
          <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">Loading...</p>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600 mt-1">
            Win Rate (7d)
          </p>
          <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-600 to-teal-400 rounded-full"
              style={{ width: '50%' }}
            />
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 animate-pulse col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Cpu size={16} className="text-zinc-400" />
            </div>
            <span className="text-[11px] text-zinc-500">Loading...</span>
          </div>
          <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">Loading...</p>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600 mt-1">
            Avg Confidence
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-zinc-500 to-teal-400 rounded-full"
                style={{ width: '50%' }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">0.75 min</span>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Activity size={16} className="text-zinc-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
              Active Position
            </span>
          </div>
          <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">Loading...</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md font-mono">
              Loading...
            </span>
            <span className="text-xs text-teal-400 font-mono">LONG</span>
          </div>
          <p className="text-[11px] text-zinc-600 mt-2">Loading...</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
                <Zap size={16} className="text-zinc-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                Last Signal
              </span>
            </div>
            <span className="text-[10px] text-zinc-600 font-mono">Loading...</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl font-bold badge-buy px-3 py-1 rounded-lg font-mono">
              Loading...
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-teal-400 rounded-full" style={{ width: '50%' }} />
            </div>
            <span className="text-xs font-mono text-teal-400 tabular-nums">0.500</span>
          </div>
          <p className="text-[10px] text-zinc-600 mt-1.5">Loading... · TFT Model v2024-09</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <TrendingUp size={16} className="text-zinc-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
              Trades (24h)
            </span>
          </div>
          <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">Loading...</p>
          <span className="text-[11px] text-zinc-600 mt-2">Loading...</span>
        </div>
        <div className="bg-gradient-to-br from-amber-500/5 to-zinc-900 border border-amber-500/30 rounded-2xl p-5 animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <AlertTriangle size={16} className="text-amber-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70">
                Drawdown
              </span>
            </div>
            <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-semibold">
              Loading...
            </span>
          </div>
          <p className="text-2xl font-bold text-amber-400 font-mono tabular-nums">Loading...</p>
          <p className="text-[11px] text-amber-500/60 mt-1">Loading... · Alert fires at 5%</p>
          <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full"
              style={{ width: '50%' }}
            />
          </div>
        </div>
      </div>
    );
  }

  const { pnl, winRate, confidence, activePosition, lastSignal, trades24h, drawdown } = {
    pnl: pnlData,
    winRate: winRateData,
    confidence: confidenceData,
    activePosition: activePositionData,
    lastSignal: lastSignalData,
    trades24h: trades24hData,
    drawdown: drawdownData,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4 mb-6">
      {/* HERO: Realized P&L — spans 2 cols */}
      <div className="col-span-2 bg-gradient-to-br from-zinc-900 to-zinc-900/80 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group hover:border-teal-500/30 transition-all duration-200">
        <div className="absolute top-0 right-0 w-48 h-48 bg-teal-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-teal-500/15 flex items-center justify-center">
                <DollarSign size={16} className="text-teal-400" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Realized P&L
              </span>
            </div>
            <DeltaBadge delta={pnl.delta} dir={pnl.deltaDir} />
          </div>
          <p className="text-4xl font-bold text-teal-400 font-mono tabular-nums">{pnl.value}</p>
          <p className="text-xs text-zinc-600">All-time · 347 closed trades · Since Jan 2024</p>
          {/* Sparkline placeholder */}
          <div className="mt-3 flex items-end gap-0.5 h-8">
            {[40, 55, 48, 62, 58, 72, 65, 78, 70, 85, 80, 92].map((h, i) => (
              <div
                key={`spark-${i}`}
                className="flex-1 bg-teal-500/30 rounded-sm"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Win Rate */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all duration-200 group">
        <div className="flex items-center justify-between mb-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Target
              size={16}
              className="text-zinc-400 group-hover:text-teal-400 transition-colors"
            />
          </div>
          <DeltaBadge delta={winRate.delta} dir={winRate.deltaDir} />
        </div>
        <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">{winRate.value}</p>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600 mt-1">
          Win Rate (7d)
        </p>
        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-600 to-teal-400 rounded-full"
            style={{ width: `${winRate.value.replace('%', '')}%` }}
          />
        </div>
      </div>

      {/* Model Confidence */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all duration-200 group">
        <div className="flex items-center justify-between mb-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Cpu size={16} className="text-zinc-400 group-hover:text-teal-400 transition-colors" />
          </div>
          <DeltaBadge delta={confidence.delta} dir={confidence.deltaDir} />
        </div>
        <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">
          {confidence.value}
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600 mt-1">
          Avg Confidence
        </p>
        <div className="mt-3 flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-zinc-500 to-teal-400 rounded-full"
              style={{ width: `${(parseFloat(confidence.value) * 100).toFixed(1)}%` }}
            />
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">0.75 min</span>
        </div>
      </div>

      {/* Active Position */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Activity size={16} className="text-zinc-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            Active Position
          </span>
        </div>
        <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">
          {activePosition.value}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md font-mono">
            BTC-USDT
          </span>
          <span className="text-xs text-teal-400 font-mono">LONG</span>
        </div>
        <p className="text-[11px] text-zinc-600 mt-2">Entry: $61,420.50 · Size: 0.068 BTC</p>
      </div>

      {/* Last Signal */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all duration-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Zap size={16} className="text-zinc-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
              Last Signal
            </span>
          </div>
          <span className="text-[10px] text-zinc-600 font-mono">{lastSignal.age}</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`text-2xl font-bold badge-${lastSignal.value.toLowerCase() === 'buy' ? 'buy' : lastSignal.value.toLowerCase() === 'sell' ? 'sell' : 'neutral'} px-3 py-1 rounded-lg font-mono`}
          >
            {lastSignal.value}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-400 rounded-full"
              style={{ width: `${lastSignal.confidence * 100}%` }}
            />
          </div>
          <span className="text-xs font-mono text-teal-400 tabular-nums">
            {lastSignal.confidence.toFixed(3)}
          </span>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1.5">{lastSignal.pair} · TFT Model v2024-09</p>
      </div>

      {/* 24h Trades */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all duration-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
            <TrendingUp size={16} className="text-zinc-400" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            Trades (24h)
          </span>
        </div>
        <p className="text-2xl font-bold text-zinc-100 font-mono tabular-nums">{trades24h.value}</p>
        <DeltaBadge delta={trades24h.delta} dir={trades24h.deltaDir} />
        <p className="text-[11px] text-zinc-600 mt-2">18 filled · 3 cancelled · 2 pending</p>
      </div>

      {/* Drawdown — ALERT state */}
      <div
        className={`bg-gradient-to-br from-amber-500/5 to-zinc-900 border border-amber-500/30 rounded-2xl p-5 hover:border-amber-500/50 transition-all duration-200 ${drawdown.deltaDir === 'warn' ? 'border-amber-500/50' : ''}`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <AlertTriangle size={16} className="text-amber-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70">
              Drawdown
            </span>
          </div>
          <span className="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full font-semibold">
            {drawdown.deltaDir === 'warn' ? 'NEAR LIMIT' : 'NORMAL'}
          </span>
        </div>
        <p className="text-2xl font-bold text-amber-400 font-mono tabular-nums">{drawdown.value}</p>
        <p className="text-[11px] text-amber-500/60 mt-1">
          Limit: {drawdown.threshold} · Alert fires at 5%
        </p>
        <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full"
            style={{ width: `${drawdown.value.replace('%', '')}%` }}
          />
        </div>
      </div>
    </div>
  );
}
