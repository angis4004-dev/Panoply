import Link from 'next/link';
import { Bot, CheckCircle, Shield, TrendingUp, User } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';

const plans = [
  {
    name: 'Free',
    price: '$0',
    badge: 'Free Forever',
    featured: false,
    features: ['Up to 5 wallets', '1 active signal flow', 'Basic analytics', 'Community support'],
  },
  {
    name: 'Pro',
    price: '$49',
    badge: 'Most Popular',
    featured: true,
    features: [
      'Unlimited wallets',
      '10 active signal flows',
      'Advanced analytics',
      'Priority support',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    badge: 'For Teams',
    featured: false,
    features: [
      'Unlimited everything',
      'Dedicated manager',
      'Custom integrations',
      'SLA & security',
    ],
  },
];

const featureIcons = [User, Bot, TrendingUp, Shield];

export function PricingSection() {
  return (
    <section id="pricing" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <p className="text-ds-caption font-semibold uppercase tracking-[0.35em] text-primary mb-3">
            Simple, transparent pricing
          </p>
          <h2 className="text-3xl font-bold text-white">Choose Your Plan</h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan, planIndex) => (
            <Reveal key={plan.name} delay={planIndex * 100} className="h-full">
              <div
                className={`h-full rounded-xl border p-6 flex flex-col transition-all duration-300 hover:-translate-y-1 ${
                  plan.featured
                    ? 'border-primary/50 bg-[#17202e]/80 shadow-[0_0_40px_rgba(30,99,255,0.08)] hover:shadow-[0_0_50px_rgba(30,99,255,0.14)]'
                    : 'border-[#212A35] bg-[#122131]/50 hover:border-primary/25'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      plan.featured ? 'text-primary bg-primary/10' : 'text-[#8B95A5] bg-[#212A35]'
                    }`}
                  >
                    {plan.featured && <CheckCircle className="inline h-3 w-3 mr-1" />}
                    {plan.badge}
                  </span>
                </div>
                <p className="text-3xl font-bold text-white mb-6">
                  {plan.price}
                  {plan.price !== 'Custom' && (
                    <span className="text-sm font-normal text-[#8B95A5]">/month</span>
                  )}
                </p>
                <ul className="space-y-3 text-sm text-[#8B95A5] mb-8 flex-1">
                  {plan.features.map((feature, i) => {
                    const Icon = featureIcons[i] ?? CheckCircle;
                    return (
                      <li key={feature} className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        {feature}
                      </li>
                    );
                  })}
                </ul>
                <Link
                  href="/sign-up-login-screen"
                  className={`w-full text-center px-4 py-3 text-sm font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0E13] ${
                    plan.featured
                      ? 'text-primary-foreground bg-primary hover:bg-primary/90'
                      : 'text-[#E7ECF2] border border-[#212A35] hover:border-primary/40 hover:bg-[#17202e]'
                  }`}
                >
                  {plan.price === 'Custom' ? 'Contact Sales' : 'Get Started'}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
