import { CheckCircle, Lock, Monitor, Shield } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';

const items = [
  {
    icon: Shield,
    title: 'Secure Infrastructure',
    desc: 'Bank-level encryption and hardened session management protect your account.',
  },
  {
    icon: Lock,
    title: 'Non-Custodial',
    desc: 'You retain full control of your assets. Aegis never holds your private keys.',
  },
  {
    icon: CheckCircle,
    title: 'Audited & Verified',
    desc: 'Smart contracts and integrations reviewed against industry security standards.',
  },
  {
    icon: Monitor,
    title: '24/7 Monitoring',
    desc: 'Real-time threat detection and automated alerts on portfolio anomalies.',
  },
];

export function SecuritySection() {
  return (
    <section id="security" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-primary mb-3">
            Before anything else
          </p>
          <h2 className="text-3xl font-bold text-white mb-4">Your Keys. Your Crypto. Always.</h2>
          <p className="text-[#8B95A5] max-w-2xl mx-auto">
            Aegis never takes custody of your assets. Every strategy runs non-custodially, with
            bank-level encryption and 24/7 automated monitoring on your account.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delay={i * 80}>
                <div className="h-full bg-[#122131]/50 border border-[#212A35] rounded-xl p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-primary/25">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-[#8B95A5]">{item.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
