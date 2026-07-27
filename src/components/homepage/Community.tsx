import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';

export function Community() {
  return (
    <section className="py-20 border-t border-[#212A35]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#1E63FF]/10">
          <LifeBuoy className="h-5 w-5 text-[#1E63FF]" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">You&apos;re Never Trading Alone</h2>
        <p className="text-[#8B95A5] leading-relaxed mb-6">
          Questions about a strategy or your account? Reach out directly from your dashboard — no
          ticket queues, no runaround.
        </p>
        <Link
          href="/sign-up-login-screen"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#1E63FF] hover:underline"
        >
          Create your account →
        </Link>
      </div>
    </section>
  );
}
