'use client';

import { Link } from '@/i18n/navigation';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { SignalField } from '@/components/ui/signal-field';
import { useScrollParallax } from '@/hooks/use-scroll-parallax';

export function Hero() {
  // Subtle parallax depth on the ambient orb as the hero scrolls out of
  // view - drifts down and fades rather than just sitting static, the
  // "special effect" distinguishing this from a generic dark dashboard.
  const scrollProgress = useScrollParallax(500);
  const orbStyle = {
    transform: `translateY(${scrollProgress * 36}px) scale(${1 + scrollProgress * 0.12})`,
    opacity: 1 - scrollProgress * 0.6,
  };

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
        <div className="relative overflow-hidden grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center rounded-2xl border border-ds-border bg-ds-surface-overlay/50 backdrop-blur-sm p-6 sm:p-10">
          {/* Below lg there's no second column to hold the orb, so it
              renders as an absolutely-positioned ambient layer behind the
              text instead of its own stacked block - keeps it blended
              rather than a floating shape with dead space around it. */}
          <div
            className="ds-ambient-orb lg:hidden"
            aria-hidden
            style={{ ...orbStyle, opacity: 0.7 - scrollProgress * 0.42 }}
          />

          <Reveal className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-4 py-1.5 mb-6">
              <span className="text-ds-caption font-semibold uppercase tracking-[0.35em] text-primary">
                Quantitative Intelligence for Decentralized Finance
              </span>
            </div>
            {/* Display serif at 400, not the body sans at 700. The emphasis on
                the second clause was a cream-to-cyan-to-purple gradient clip,
                which is the most recognisable stock-SaaS headline treatment
                there is; it now leans on the brand cream and an italic, which
                the serif actually has a drawn face for. */}
            <h1 className="font-display font-normal text-[2.75rem] leading-[1.05] sm:text-[4rem] sm:leading-[1.03] tracking-[-0.015em] text-white mb-6">
              Disciplined automation for <em className="not-italic text-primary">on-chain</em>{' '}
              <span className="italic text-primary">portfolios.</span>
            </h1>
            <p className="text-ds-text-muted text-base sm:text-lg mb-8 max-w-xl leading-relaxed">
              Panoply combines quantitative research, automated execution, and risk management in a
              single non-custodial platform. Set your risk parameters and let disciplined,
              continuously monitored automation handle the rest.
            </p>
            {/* The field spans the CTA row and reads in the space around and
                between the two buttons - the cream fill is opaque, so behind
                them there would be nothing to see. -mx-3 keeps the buttons on
                the same optical left edge as the paragraph above despite the
                padding the field needs. */}
            <SignalField variant="cta" className="-mx-3 flex flex-wrap gap-4 px-3 py-3">
              <Link
                href="/sign-up-login-screen"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition duration-fast ease-ds-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
              >
                Put Your Portfolio on Autopilot
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-[#E7ECF2] border border-ds-border hover:border-primary/50 hover:bg-ds-surface-inset rounded-lg transition duration-fast ease-ds-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
              >
                See How It Works
              </a>
            </SignalField>
          </Reveal>

          <Reveal delay={150} className="hidden lg:block">
            <div className="relative h-[320px] lg:h-[380px]">
              <div className="ds-ambient-orb" aria-hidden style={orbStyle} />
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
