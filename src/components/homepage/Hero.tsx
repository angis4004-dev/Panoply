'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import Chart from 'chart.js/auto';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { BRAND_COLORS } from '@/lib/brand-colors';

// Deterministic pseudo-random walk so the hero chart reads as real price
// action instead of an obviously synthetic sine wave, while staying stable
// across re-renders (no Math.random - a fixed seed keeps SSR/CSR in sync).
function generateSeries(points: number, seed: number) {
  let value = 100;
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const series: number[] = [];
  for (let i = 0; i < points; i++) {
    const drift = 0.45;
    const noise = (next() - 0.45) * 5;
    value = Math.max(value + drift + noise, 20);
    series.push(value);
  }
  return series;
}

export function Hero() {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const series = useMemo(() => generateSeries(40, 42), []);
  const startValue = series[0];
  const endValue = series[series.length - 1];
  const changePct = (((endValue - startValue) / startValue) * 100).toFixed(1);
  const displayValue = (endValue * 942.3).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  useEffect(() => {
    const canvas = chartRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 300);
    gradient.addColorStop(0, 'rgba(30, 99, 255, 0.35)');
    gradient.addColorStop(0.6, 'rgba(0, 212, 255, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');

    const labels = series.map((_, i) => i);
    const chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Portfolio Value',
            data: series,
            borderColor: BRAND_COLORS.blue,
            backgroundColor: gradient,
            tension: 0.4,
            fill: true,
            pointRadius: 0,
            borderWidth: 2.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false, grid: { display: false } },
          y: {
            display: true,
            grid: { color: 'rgba(255,255,255,0.05)', drawTicks: false },
            ticks: { display: false },
            border: { display: false },
            grace: '15%',
          },
        },
        animation: { duration: 0 },
      },
    });

    return () => chartInstance.destroy();
  }, [series]);

  return (
    <section className="relative pt-28 pb-20 overflow-hidden">
      {/* Dotted grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage:
            'repeating-linear-gradient(to right, black 0px, black 2px, transparent 2px, transparent 8px), repeating-linear-gradient(to bottom, black 0px, black 2px, transparent 2px, transparent 8px)',
          WebkitMaskImage:
            'repeating-linear-gradient(to right, black 0px, black 2px, transparent 2px, transparent 8px), repeating-linear-gradient(to bottom, black 0px, black 2px, transparent 2px, transparent 8px)',
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center rounded-2xl border border-[#212A35] bg-[#0D131C]/50 backdrop-blur-sm p-6 sm:p-10">
          <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-4 py-1.5 mb-6">
              <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-primary">
                Quantitative Intelligence for Decentralized Finance
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-5 leading-tight">
              Disciplined automation for{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-brand-cyan to-[#7B61FF]">
                on-chain portfolios.
              </span>
            </h1>
            <p className="text-[#8B95A5] text-lg mb-8 max-w-xl leading-relaxed">
              Aegis combines quantitative research, automated execution, and risk management in a
              single non-custodial platform. Set your risk parameters and let disciplined,
              continuously monitored automation handle the rest.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/sign-up-login-screen"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-[#F2F5FA] bg-primary hover:bg-[#3D77FF] rounded-lg transition-all active:scale-[0.97] hover:shadow-lg hover:shadow-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Put Your Portfolio on Autopilot
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-[#E7ECF2] border border-[#212A35] hover:border-primary/50 hover:bg-[#17202e] rounded-lg transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                See How It Works
              </a>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="relative h-[320px] lg:h-[380px] rounded-xl border border-[#212A35] bg-[#122131]/60 p-4 transition-transform duration-300 hover:-translate-y-1">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <p className="text-xs text-[#8B95A5] font-mono uppercase tracking-wider mb-1.5">
                    Portfolio performance
                  </p>
                  <p className="text-2xl font-bold text-white font-mono tabular-nums">
                    {displayValue}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-brand-green/25 bg-brand-green/10 px-2.5 py-1 text-xs font-semibold text-brand-green">
                  <TrendingUp className="h-3 w-3" />+{changePct}%
                </span>
              </div>
              <div className="h-[calc(100%-4rem)]">
                <canvas ref={chartRef} />
              </div>
            </div>
          </Reveal>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.3em] text-[#4b5563]">
          <span>Institutional-grade infrastructure</span>
          <span>Non-custodial · Risk-managed · Always on</span>
        </div>
      </div>
    </section>
  );
}
