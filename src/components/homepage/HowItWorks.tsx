import { Reveal } from '@/components/ui/Reveal';

export function HowItWorks() {
  const steps = [
    {
      num: '1',
      title: 'Connect',
      desc: 'Sign up with email or Google. Your account is secured with industry-standard encryption.',
    },
    {
      num: '2',
      title: 'Configure',
      desc: 'Choose a signal flow strategy, invest in a vault, or run the Portfolio Builder for a tailored report.',
    },
    {
      num: '3',
      title: 'Grow',
      desc: 'Signal flows execute 24/7, vaults compound, and yields auto-track across your holdings.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 border-y border-ds-border bg-[#0D1219]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <p className="text-ds-caption font-semibold uppercase tracking-[0.35em] text-primary mb-3">
            Getting started
          </p>
          <h2 className="font-display font-normal text-[2rem] sm:text-[2.75rem] leading-[1.1] tracking-[-0.01em] text-white">
            How It Works
          </h2>
        </div>
        <div className="relative grid gap-10 sm:grid-cols-3">
          <div
            aria-hidden
            className="pointer-events-none absolute top-6 left-0 right-0 hidden h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent sm:block"
          />
          {steps.map((step, i) => (
            <Reveal key={step.num} delay={i * 100} className="text-center group">
              <div className="relative mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#0D1219] border border-primary/40 font-display text-2xl font-normal text-primary transition duration-base ease-ds-out group-hover:border-primary group-hover:bg-primary/15 group-hover:scale-110">
                {step.num}
              </div>
              <h3 className="font-display font-normal text-2xl text-white mb-2">{step.title}</h3>
              <p className="text-sm text-ds-text-muted leading-relaxed max-w-xs mx-auto">
                {step.desc}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
