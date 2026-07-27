import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';

export function Community() {
  return (
    <section className="py-20 border-t border-[#212A35]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Reveal className="group">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 transition-transform duration-300 group-hover:scale-110">
            <LifeBuoy className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">You&apos;re Never Trading Alone</h2>
          <p className="text-[#8B95A5] leading-relaxed mb-6">
            Questions about a strategy or your account? Reach out directly from your dashboard — no
            ticket queues, no runaround.
          </p>
          <Link
            href="/sign-up-login-screen"
            className="inline-flex items-center gap-2 rounded text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13]"
          >
            Create your account →
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
