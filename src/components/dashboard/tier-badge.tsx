'use client';

import { motion, MotionConfig } from 'framer-motion';

const TIER_LABELS: Record<string, string> = {
  unverified: 'Unverified',
  novice: 'Novice',
  amateur: 'Amateur',
  strategist: 'Strategist',
  vanguard: 'Aegis Vanguard',
};

const TIER_STYLES: Record<string, string> = {
  unverified: 'bg-[#8B95A5]/10 text-[#8B95A5]',
  novice: 'bg-[#8B95A5]/10 text-[#8B95A5]',
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

  return (
    <MotionConfig reducedMotion="user">
      <motion.span
        key={tier}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`relative inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style}`}
      >
        {glow && (
          <motion.span
            className="pointer-events-none absolute inset-0 -z-10 rounded-full blur-md"
            style={{ backgroundColor: 'currentColor' }}
            animate={{ opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        {label}
      </motion.span>
    </MotionConfig>
  );
}
