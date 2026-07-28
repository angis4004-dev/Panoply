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

export function TierBadge({ tier }: { tier: string }) {
  const label = TIER_LABELS[tier] || 'Unverified';
  const style = TIER_STYLES[tier] || TIER_STYLES.unverified;

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style}`}>
      {label}
    </span>
  );
}
