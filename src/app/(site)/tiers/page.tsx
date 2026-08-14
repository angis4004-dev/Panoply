import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle, Star } from 'lucide-react';
import { Navbar } from '@/components/homepage/navbar';
import { Footer } from '@/components/homepage/Footer';
import { PageBackground } from '@/components/backgrounds/PageBackground';
import { Reveal } from '@/components/ui/Reveal';
import { FaqAccordion } from '@/components/about/FaqAccordion';

export const metadata: Metadata = {
  title: 'Tiers | Panoply',
  description:
    'Panoply account tiers - Novice, Amateur, Strategist, and Vanguard - unlock based on lifetime amount deposited, not a subscription.',
};

/**
 * Mirrors the real account-tier engine (src/lib/achievements/engine.ts):
 * tier is computed from lifetime deposited amount, gated on KYC, and
 * controls how many signal flows a user can run at once. This is not a
 * subscription - there is no monthly price, only deposit thresholds.
 * Accent colors and the higher-tier glow match the dashboard's TierBadge
 * (src/components/dashboard/tier-badge.tsx) so the tier identity is
 * consistent wherever it shows up.
 */
const tiers = [
  {
    name: 'Novice',
    threshold: '$0+',
    accent: 'text-ds-text-muted',
    accentBg: 'bg-[#8B95A5]/10',
    border: 'border-ds-border',
    glow: '',
    for: 'Everyone starts here once KYC is verified, regardless of deposit size.',
    features: ['1 active signal flow', 'Basic analytics', 'Community support'],
  },
  {
    name: 'Amateur',
    threshold: '$1,000+',
    accent: 'text-primary',
    accentBg: 'bg-primary/10',
    border: 'border-primary/50',
    glow: '',
    for: 'Reached once your lifetime deposits cross $1,000.',
    features: ['3 active signal flows', 'Advanced analytics', 'Priority support'],
  },
  {
    name: 'Strategist',
    threshold: '$10,000+',
    accent: 'text-brand-purple',
    accentBg: 'bg-brand-purple/10',
    border: 'border-brand-purple/40',
    glow: 'shadow-[0_0_40px_rgba(123,97,255,0.16)]',
    for: 'Reached once your lifetime deposits cross $10,000.',
    features: ['6 active signal flows', 'Advanced analytics', 'Priority support'],
  },
  {
    name: 'Vanguard',
    threshold: '$50,000+',
    accent: 'text-green-400',
    accentBg: 'bg-green-400/10',
    border: 'border-green-400/40',
    glow: 'shadow-[0_0_40px_rgba(74,222,128,0.16)]',
    for: 'Reached once your lifetime deposits cross $50,000.',
    features: ['Unlimited signal flows', 'Advanced analytics', 'Dedicated support'],
  },
];

const faqItems = [
  {
    question: 'Do I have to pay a subscription to unlock a tier?',
    answer:
      "No. Tiers aren't a subscription - they unlock automatically based on your lifetime amount deposited. There's no recurring fee to reach Amateur, Strategist, or Vanguard.",
  },
  {
    question: 'Does withdrawing money lower my tier?',
    answer:
      'No. Tier is based on lifetime deposited, not current balance, so withdrawals never demote you back to a lower tier.',
  },
  {
    question: 'Why do I need to verify KYC before reaching Novice?',
    answer:
      'KYC verification gates every tier, including Novice. An unverified account has no tier at all, regardless of how much has been deposited.',
  },
  {
    question: 'What does a higher tier actually unlock?',
    answer:
      'Primarily how many signal flows you can run at once - 1 at Novice, 3 at Amateur, 6 at Strategist, and unlimited at Vanguard - plus deeper analytics and faster support as you climb.',
  },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-ds-caption font-semibold uppercase tracking-[0.35em] text-primary mb-3">
      {children}
    </p>
  );
}

export default function TiersPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative isolate min-h-screen text-[#E7ECF2] antialiased"
    >
      <PageBackground />
      <Navbar />

      <section className="relative pt-32 pb-16 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(30,99,255,0.10),transparent_60%)]"
        />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <SectionEyebrow>Deposit-based, not a subscription</SectionEyebrow>
            <h1 className="font-display font-normal text-[2.75rem] sm:text-[4rem] leading-[1.05] tracking-[-0.015em] text-white mb-6">
              Account Tiers
            </h1>
            <p className="text-ds-text-muted text-lg leading-relaxed max-w-2xl mx-auto">
              Panoply has four account tiers - Novice, Amateur, Strategist, and Vanguard. Your tier
              is set automatically by your lifetime amount deposited, not a monthly fee, and
              controls how many signal flows you can run at once.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((tier, tierIndex) => (
              <Reveal key={tier.name} delay={tierIndex * 100} className="h-full">
                <div
                  className={`h-full rounded-xl border ${tier.border} ${tier.glow} bg-ds-surface-raised/50 p-6 flex flex-col transition duration-base ease-ds-out hover:-translate-y-1`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1.5">
                      <Star className={`h-4 w-4 ${tier.accent}`} fill="currentColor" />
                      <h2 className="font-display font-normal text-xl text-white">{tier.name}</h2>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${tier.accentBg} ${tier.accent}`}
                    >
                      {tier.threshold}
                    </span>
                  </div>
                  <p className="text-sm text-ds-text-muted leading-relaxed mb-6">{tier.for}</p>
                  <ul className="space-y-3 text-sm text-ds-text-muted mb-8 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <CheckCircle className={`h-4 w-4 shrink-0 ${tier.accent}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/sign-up-login-screen"
                    className="w-full text-center px-4 py-3 text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface text-[#E7ECF2] border border-ds-border hover:border-primary/40 hover:bg-ds-surface-inset"
                  >
                    Get Started
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-ds-border bg-[#0D1219]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <SectionEyebrow>Common questions</SectionEyebrow>
            <h2 className="font-display font-normal text-[2rem] sm:text-[2.5rem] leading-[1.1] tracking-[-0.01em] text-white">
              About the tiers
            </h2>
          </div>
          <Reveal>
            <FaqAccordion items={faqItems} />
          </Reveal>
        </div>
      </section>

      <Footer />
    </main>
  );
}
