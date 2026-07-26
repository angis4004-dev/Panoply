'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function FinalCTA() {
  return (
    <section className="py-20 text-center bg-background/50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-foreground mb-6">
          Your DeFi. Intelligently managed.
        </h2>
        <p className="text-xl text-foreground/80 mb-8">
          Enter the future of AI-powered portfolio management.
        </p>
        <Link
          href="/sign-up-login-screen"
          className="inline-flex items-center px-6 py-3 bg-primary text-[#1A1305] font-semibold rounded-lg hover:bg-primary/90 transition-colors transform hover:-translate-y-1"
        >
          Launch Aegis
          <ArrowRight className="ml-3 h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
