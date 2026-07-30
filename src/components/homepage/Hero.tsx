'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { AmbientGlobe } from '@/components/homepage/deploy-engine/AmbientGlobe';

export function Hero() {
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
              <span className="text-ds-caption font-semibold uppercase tracking-[0.35em] text-primary">
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
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition duration-fast ease-ds-out active:scale-[0.97] hover:shadow-lg hover:shadow-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Put Your Portfolio on Autopilot
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-[#E7ECF2] border border-[#212A35] hover:border-primary/50 hover:bg-[#17202e] rounded-lg transition duration-fast ease-ds-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                See How It Works
              </a>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="relative h-[320px] lg:h-[380px] overflow-hidden rounded-xl border border-[#212A35] bg-[#122131]/60 transition-transform duration-base ease-ds-out hover:-translate-y-1">
              <AmbientGlobe className="h-full w-full opacity-60" />
            </div>
          </Reveal>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-ds-caption uppercase tracking-[0.3em] text-ds-text-muted">
          <span>Institutional-grade infrastructure</span>
          <span>Non-custodial · Risk-managed · Always on</span>
        </div>
      </div>
    </section>
  );
}
