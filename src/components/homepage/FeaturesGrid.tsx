import { Bot, Shield, TrendingUp, Zap } from 'lucide-react';
import Link from 'next/link';
import { Reveal } from '@/components/ui/Reveal';

const features = [
  {
    icon: Bot,
    title: 'AI-Powered Bots',
    description:
      'Grid, DCA, and arbitrage bots that adapt to market conditions with automated parameter tuning.',
    href: '/dashboard/bots',
  },
  {
    icon: Shield,
    title: 'Risk-Managed Vaults',
    description:
      'Institutional-grade vaults with transparent performance tracking and dynamic risk controls.',
    href: '/dashboard/vaults',
  },
  {
    icon: TrendingUp,
    title: 'Optimized Yield',
    description:
      'Access the highest yields across chains with AI-suggested allocations and auto-compounding.',
    href: '/dashboard/yield',
  },
  {
    icon: Zap,
    title: 'Portfolio Builder',
    description:
      'Generate a personalized portfolio report with risk analysis, delivered straight to your inbox.',
    href: '/dashboard/builder',
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-white mb-4">
            Earn With Elite AI Strategies — Or Build Your Own
          </h2>
          <p className="text-[#8B95A5] max-w-2xl mx-auto">
            Sit back and let AI-managed bots and vaults earn for you, or step in and build a custom
            strategy with the Portfolio Builder. Either way, you stay in control.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Reveal key={feature.title} delay={i * 80}>
                <Link href={feature.href} className="group block h-full">
                  <div className="h-full bg-[#122131]/50 border border-[#212A35] rounded-xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:bg-[#17202e]/50">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 mb-4">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                    <p className="text-sm text-[#8B95A5] leading-relaxed">{feature.description}</p>
                    <span className="inline-block mt-4 text-sm font-medium text-primary group-hover:underline">
                      Learn more →
                    </span>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
