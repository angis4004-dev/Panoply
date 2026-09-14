import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { SignalField, signalHeadline } from '@/components/ui/signal-field';

export function FinalCta() {
  return (
    <section className="py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <SignalField className="px-8 py-14 text-center backdrop-blur-sm" readout="PANOPLY · LIVE">
            {/* Was rgba(30,99,255) - a stray blue that appears nowhere in the
                palette and is not the brand navy. Now the navy itself. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(36,59,143,0.28),transparent_70%)]"
            />
            <div className="relative">
              <h2
                className={`font-display font-medium text-[2.3rem] sm:text-[3rem] leading-[1.08] tracking-[-0.01em] text-white mb-4 ${signalHeadline}`}
              >
                Bring Discipline to Your On-Chain Portfolio
              </h2>
              <p className="text-ds-text-muted mb-8 max-w-xl mx-auto">
                Join Panoply for quantitative research and automated execution, while you stay in
                control of every risk parameter.
              </p>
              <Link
                href="/sign-up-login-screen"
                className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition duration-fast ease-ds-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </SignalField>
        </Reveal>
      </div>
    </section>
  );
}
