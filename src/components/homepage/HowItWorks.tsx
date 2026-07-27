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
      desc: 'Choose a bot strategy, invest in a vault, or run the Portfolio Builder for a tailored report.',
    },
    {
      num: '3',
      title: 'Grow',
      desc: 'Bots execute 24/7, vaults compound, and yields auto-track across your holdings.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 border-y border-[#212A35] bg-[#0D1219]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-white text-center mb-14">How It Works</h2>
        <div className="grid gap-10 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.num} className="text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 border border-primary/40 text-lg font-bold text-primary">
                {step.num}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-sm text-[#8B95A5] leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
