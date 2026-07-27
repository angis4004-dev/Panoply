'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Chart from 'chart.js/auto';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';

export function Hero() {
  const chartRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = chartRef.current?.getContext('2d');
    if (!ctx) return;

    const labels = Array.from({ length: 30 }, (_, i) => i);
    const chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Portfolio Value',
            data: labels.map((_, i) => 60 + i * 1.2 + Math.sin(i / 3) * 8),
            borderColor: '#1E63FF',
            backgroundColor: 'rgba(30, 99, 255, 0.12)',
            tension: 0.35,
            fill: true,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false, grid: { display: false } },
          y: { display: false, grid: { display: false } },
        },
        animation: { duration: 0 },
      },
    });

    return () => chartInstance.destroy();
  }, []);

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
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1E63FF]/25 bg-[#1E63FF]/5 px-4 py-1.5 mb-6">
              <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#1E63FF]">
                Trusted by 50,000+ traders
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-5 leading-tight">
              Trade like{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#1E63FF] via-[#00D4FF] to-[#7B61FF]">
                the best.
              </span>
            </h1>
            <p className="text-[#8B95A5] text-lg mb-8 max-w-xl leading-relaxed">
              Deploy the same AI strategies serious traders use — non-custodially, on autopilot. Set
              your risk, and let Aegis handle the rest.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/sign-up-login-screen"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-[#F2F5FA] bg-[#1E63FF] hover:bg-[#3D77FF] rounded-lg transition-all active:scale-[0.97] hover:shadow-lg hover:shadow-[#1E63FF]/25"
              >
                Put Your Portfolio on Autopilot
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-[#E7ECF2] border border-[#212A35] hover:border-[#1E63FF]/50 hover:bg-[#17202e] rounded-lg transition-all active:scale-[0.97]"
              >
                See How It Works
              </a>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="relative h-[320px] lg:h-[380px] rounded-xl border border-[#212A35] bg-[#122131]/60 p-4 transition-transform duration-300 hover:-translate-y-1">
              <p className="text-xs text-[#8B95A5] mb-2 font-mono uppercase tracking-wider">
                Portfolio performance
              </p>
              <div className="h-[calc(100%-1.5rem)]">
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
