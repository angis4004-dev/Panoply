import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';

export function FinalCta() {
  return (
    <section className="py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative rounded-2xl border border-[#212A35] bg-[#122131]/60 backdrop-blur-sm px-8 py-14 text-center overflow-hidden">
            {/* Was rgba(30,99,255) - a stray blue that appears nowhere in the
                palette and is not the brand navy. Now the navy itself. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(36,59,143,0.28),transparent_70%)]"
            />
            <div className="relative">
              <h2 className="font-display font-normal text-[2rem] sm:text-[3rem] leading-[1.08] tracking-[-0.01em] text-white mb-4">
                Bring Discipline to Your On-Chain Portfolio
              </h2>
              <p className="text-[#8B95A5] mb-8 max-w-xl mx-auto">
                Join Aegis for quantitative research and automated execution, while you stay in
                control of every risk parameter.
              </p>
              <Link
                href="/sign-up-login-screen"
                className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition duration-fast ease-ds-out active:scale-[0.97] hover:shadow-lg hover:shadow-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
