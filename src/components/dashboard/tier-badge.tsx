'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

const TIER_LABELS: Record<string, string> = {
  unverified: 'Unverified',
  novice: 'Novice',
  amateur: 'Amateur',
  strategist: 'Strategist',
  vanguard: 'Aegis Vanguard',
};

const TIER_STYLES: Record<string, string> = {
  unverified: 'bg-[#8B95A5]/10 text-ds-text-muted',
  novice: 'bg-[#8B95A5]/10 text-ds-text-muted',
  amateur: 'bg-primary/10 text-primary',
  strategist: 'bg-brand-purple/10 text-brand-purple',
  vanguard: 'bg-green-400/10 text-green-400',
};

// Higher tiers get an ambient glow halo to signal status at a glance.
const GLOW_TIERS = new Set(['strategist', 'vanguard']);

export function TierBadge({ tier }: { tier: string }) {
  const label = TIER_LABELS[tier] || 'Unverified';
  const style = TIER_STYLES[tier] || TIER_STYLES.unverified;
  const glow = GLOW_TIERS.has(tier);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const glowRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (!badgeRef.current) return;
      gsap.fromTo(
        badgeRef.current,
        { opacity: 0, scale: 0.85 },
        { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out' }
      );
    },
    { dependencies: [tier], scope: badgeRef }
  );

  useGSAP(
    () => {
      if (!glow || !glowRef.current) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to(glowRef.current, {
          opacity: 0.4,
          duration: 1.1,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
      });
      return () => mm.revert();
    },
    { dependencies: [glow, tier], scope: badgeRef }
  );

  return (
    <span
      ref={badgeRef}
      className={`relative inline-flex rounded-full px-2 py-0.5 text-ds-caption font-bold uppercase ${style}`}
    >
      {glow && (
        <span
          ref={glowRef}
          className="pointer-events-none absolute inset-0 -z-10 rounded-full blur-md"
          style={{ backgroundColor: 'currentColor', opacity: 0.2 }}
        />
      )}
      {label}
    </span>
  );
}
