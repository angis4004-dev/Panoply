'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SignalField } from '@/components/ui/signal-field';
import { HeroFlow } from '@/components/homepage/HeroFlow';
import { MOTTO } from '@/lib/about-content';

/**
 * The hero, laid out as the approved example page: no box around it, the
 * headline, sentence and buttons in the left column, the flow diagram in its
 * own panel on the right. On the dark ground rather than the example's paper.
 *
 * Measurements taken from the example: a 1120px measure, columns 1fr / 1.15fr
 * with a 48px gap, the headline at up to 78px set solid, the sentence 18px
 * below it at 16px / 1.6 and 40 characters wide, and the buttons 26px below
 * that. Below `lg` the columns stack, diagram after the buttons.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-28 sm:pt-32">
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

      <div className="relative mx-auto max-w-[1120px] px-6">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
          {/* A one-time CSS entrance, not <Reveal>. Reveal hides until an
              IntersectionObserver fires and re-hides on the way out; for the
              first thing anyone sees, a viewport change (a phone's URL bar
              collapsing) could replay that and blur the headline. */}
          <div className="hero-enter">
            {/* Cormorant Garamond 500, upright, -0.01em, set solid, balanced
                across however many lines the column gives it - four beside
                the diagram on a desktop, as in the example. */}
            <h1 className="font-display text-[clamp(2.875rem,7vw,4.875rem)] font-medium leading-none tracking-[-0.01em] text-balance text-white">
              {/* U+2011, a non-breaking hyphen: "on-" must not end a line. */}
              Disciplined automation for on&#8209;chain portfolios
            </h1>
            <p className="mt-[18px] max-w-[40ch] text-base leading-[1.6] text-ds-text-muted">
              Set your risk limits once. Panoply runs the strategy and watches it around the clock,
              and your keys never leave you.
            </p>
            {/* 26px above the buttons: the field's own 12px padding plus 14px.
                -mx-3 keeps the buttons on the paragraph's left edge despite
                the padding the field needs. */}
            <SignalField variant="cta" className="-mx-3 mt-[14px] flex flex-wrap gap-4 px-3 py-3">
              <Link
                href="/sign-up-login-screen"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition duration-fast ease-ds-out hover:bg-primary/90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
              >
                Put Your Portfolio on Autopilot
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-[#E7ECF2] transition duration-fast ease-ds-out hover:bg-white/5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
              >
                See How It Works
              </a>
            </SignalField>
          </div>

          {/* The diagram's panel: the example's rounded well, as the same
              SignalField the security cards use so it keeps their cream glow.
              28px of padding and a 24px radius, as in the example. */}
          <SignalField
            variant="panel"
            className="hero-enter rounded-3xl px-2 py-6 sm:p-7"
          >
            <HeroFlow className="relative m-0 w-full" />
          </SignalField>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-3 text-ds-caption uppercase tracking-[0.12em] text-ds-text-muted">
          {/* The motto, as a quiet caption under the hero rather than a pill
              above the headline. Same constant the About page uses. */}
          <span>{MOTTO}</span>
          <span>Non-custodial · Risk-managed · Always on</span>
        </div>
      </div>
    </section>
  );
}
