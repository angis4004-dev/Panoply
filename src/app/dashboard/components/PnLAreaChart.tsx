'use client';

import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useAppStore } from '@/store/app-store';

interface ChartDataPoint {
  date: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-3 shadow-2xl min-w-[140px]">
      <p className="text-[11px] text-zinc-500 font-semibold mb-2">{label}</p>
      <p className="text-sm font-bold text-teal-400 font-mono tabular-nums">
        ${value.toLocaleString()}
      </p>
      <p className="text-[10px] text-zinc-500 mt-0.5">Portfolio Value</p>
    </div>
  );
}

// Sample data as fallback. Module-level so it has a stable reference across
// renders and doesn't need to appear in the data-fetch effect's dependencies.
const sampleData: ChartDataPoint[] = [
  { date: 'Mar 15', value: 10000 },
  { date: 'Mar 16', value: 10312 },
  { date: 'Mar 17', value: 10132 },
  { date: 'Mar 18', value: 10672 },
  { date: 'Mar 19', value: 10952 },
  { date: 'Mar 20', value: 10857 },
  { date: 'Mar 21', value: 11577 },
  { date: 'Mar 22', value: 12007 },
  { date: 'Mar 23', value: 11697 },
  { date: 'Mar 24', value: 12587 },
  { date: 'Mar 25', value: 13237 },
  { date: 'Mar 26', value: 13557 },
  { date: 'Mar 27', value: 13337 },
  { date: 'Mar 28', value: 14437 },
  { date: 'Mar 29', value: 15217 },
  { date: 'Mar 30', value: 14767 },
  { date: 'Mar 31', value: 15727 },
  { date: 'Apr 01', value: 16927 },
  { date: 'Apr 02', value: 16747 },
  { date: 'Apr 03', value: 17587 },
  { date: 'Apr 04', value: 18927 },
  { date: 'Apr 05', value: 18407 },
  { date: 'Apr 06', value: 19507 },
  { date: 'Apr 07', value: 20187 },
  { date: 'Apr 08', value: 21107 },
  { date: 'Apr 09', value: 20767 },
  { date: 'Apr 10', value: 22247 },
  { date: 'Apr 11', value: 22847 },
];

export default function PnLAreaChart() {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchChartData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch Bitcoin price history for the last 30 days
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4028'}/api/prices/chart?id=bitcoin&days=30`
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch chart data: ${response.status}`);
        }

        const chartData = await response.json();

        if (isMounted) {
          if (chartData.prices && chartData.prices.length > 0) {
            // Process the raw price data into chart-friendly format
            const processedData: ChartDataPoint[] = chartData.prices
              .map(([timestamp, price]: [number, number]) => {
                const date = new Date(timestamp);
                const dateString = date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
                return {
                  date: dateString,
                  // Normalize to starting value of 10000 for comparison with sample data
                  value: (price / chartData.prices[0][1]) * 10000,
                };
              })
              // Remove duplicates (same date can have multiple entries)
              .filter(
                (item, index, self) =>
                  index === self.findIndex((t) => t.date === item.date && t.value === item.value)
              );

            setData(processedData);
            setLoading(false);
          } else {
            // Fallback to sample data if no price data returned
            if (isMounted) {
              setData(sampleData);
              setError('Using sample data due to unavailable market data');
              setLoading(false);
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setError('Failed to load chart data. Using sample data as fallback.');
          setData(sampleData);
          setLoading(false);
          console.error('Error fetching chart data:', err);
        }
      }
    }

    fetchChartData();

    // Refetch every 5 minutes to keep data reasonably fresh
    const interval = setInterval(fetchChartData, 300000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading && data.length === 0) {
    return (
      <div className="bg-[#122131] border border-[#212A35] rounded-2xl p-5">
        <div className="flex flex-col items-center justify-center h-[200px]">
          <p className="text-zinc-500">Loading chart data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#122131] border border-[#212A35] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Cumulative P&L</h3>
          <p className="text-xs text-zinc-600 mt-0.5">Last 30 days · USDT</p>
        </div>
        <div className="flex items-center gap-1.5">
          {['7d', '14d', '30d', '90d'].map((r) => (
            <button
              key={`range-${r}`}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${
                r === '30d' ? 'bg-teal-500/15 text-teal-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="mb-3 p-3 bg-red-900/50 border border-red-800 rounded-lg text-sm">
          {error}
        </div>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00D4AA" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#00D4AA" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#52525B', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={3}
          />
          <YAxis
            tick={{ fill: '#52525B', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={10000} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#00D4AA"
            strokeWidth={2}
            fill="url(#pnlGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#00D4AA', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
