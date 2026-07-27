import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';

export function FinalCta() {
  return (
    <section className="py-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative rounded-2xl border border-[#212A35] bg-[#122131]/60 backdrop-blur-sm px-8 py-14 text-center overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(30,99,255,0.08),transparent_70%)]"
            />
            <div className="relative">
              <h2 className="text-3xl font-bold text-white mb-4">Ready to Automate Your Wealth?</h2>
              <p className="text-[#8B95A5] mb-8 max-w-xl mx-auto">
                Join Aegis and let AI handle the analysis while you stay in control of every
                decision.
              </p>
              <Link
                href="/sign-up-login-screen"
                className="inline-flex items-center gap-2 px-8 py-3.5 text-sm font-semibold text-[#F2F5FA] bg-primary hover:bg-[#3D77FF] rounded-lg transition-all active:scale-[0.97] hover:shadow-lg hover:shadow-primary/25"
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
