'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle, Lock, Monitor, Shield } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { SignalField, signalHeadline } from '@/components/ui/signal-field';

// ssr:false for two reasons: Stack's randomRotation calls Math.random()
// during render, which would desync the server pass from hydration, and it
// keeps `motion` out of the initial bundle for a widget only phones ever see.
const Stack = dynamic(() => import('@/components/ui/Stack'), { ssr: false });

const items = [
  {
    icon: Shield,
    title: 'Secure Infrastructure',
    desc: 'Bank-level encryption and hardened session management protect your account.',
  },
  {
    icon: Lock,
    title: 'Non-Custodial',
    desc: 'You retain full control of your assets. Panoply never holds your private keys.',
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

function SecurityCard({ item }: { item: (typeof items)[number] }) {
  const Icon = item.icon;
  return (
    <SignalField className="h-full w-full p-6 text-center" variant="panel">
      {/* The icon no longer scales on hover. A 110% pop is the generic move
          this system replaces; the field around it now carries the response. */}
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className={`font-display font-normal text-xl text-white mb-2 ${signalHeadline}`}>
        {item.title}
      </h3>
      <p className="text-sm text-ds-text-muted">{item.desc}</p>
    </SignalField>
  );
}

export function SecuritySection() {
  // Gate on a real media query rather than only `sm:hidden`: CSS would still
  // mount the deck on desktop, leaving its autoplay interval and motion
  // machinery running behind display:none, plus a duplicate set of headings
  // in the DOM. 639px is one below Tailwind's sm breakpoint, so this and the
  // grid below can never both be showing.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    // resize is a belt-and-braces fallback alongside the media-query event:
    // if the viewport ever changes without `change` firing, the section would
    // otherwise render neither the deck nor the grid. React bails out when
    // the value is unchanged, so the extra listener costs no re-renders.
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  // Memoised because Stack mirrors `cards` into state keyed on array
  // identity - a fresh array each render would reset the deck mid-swipe.
  const cards = useMemo(
    () =>
      items.map((item) => (
        <div
          key={item.title}
          className="flex h-full w-full items-center justify-center bg-ds-surface p-1"
        >
          <SecurityCard item={item} />
        </div>
      )),
    []
  );

  return (
    <section id="security" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <p className="text-ds-caption font-semibold uppercase tracking-[0.35em] text-primary mb-3">
            Before anything else
          </p>
          <h2 className="font-display font-normal text-[2rem] leading-[1.1] sm:text-[2.75rem] tracking-[-0.01em] text-white mb-4">
            Your Keys. Your Crypto. Always.
          </h2>
          <p className="text-ds-text-muted max-w-2xl mx-auto">
            Panoply never takes custody of your assets. Every strategy runs non-custodially, with
            bank-level encryption and 24/7 automated monitoring on your account.
          </p>
        </div>

        {/* Mobile: a swipeable deck instead of four stacked cards, which
            otherwise cost most of a screen of scrolling on a phone. */}
        {isMobile && (
          <div className="sm:hidden">
            <div className="mx-auto h-[248px] w-full max-w-[17rem]">
              <Stack
                cards={cards}
                randomRotation
                sensitivity={120}
                sendToBackOnClick
                autoplay
                autoplayDelay={4000}
                animationConfig={{ stiffness: 240, damping: 22 }}
              />
            </div>
            <p className="mt-5 text-center text-xs text-ds-text-muted">Swipe or tap to browse</p>
          </div>
        )}

        {/* Unchanged from sm upward. */}
        <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((item, i) => (
            <Reveal key={item.title} delay={i * 80} className="group">
              <SecurityCard item={item} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
