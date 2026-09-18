import { SignalField, type SignalFieldGlow } from '@/components/ui/signal-field';
import { cn } from '@/lib/utils';

/**
 * The parts every Overview card is built from, so the cards line up.
 *
 * Frame: the homepage's lit card, held still (the Overview stays open, and a
 * pulse on a screen people watch is tiring), brightening under the pointer.
 * Chip: a 34px square holding a Panoply glyph, grey at rest and cream while
 * its card is hovered - or cream always on the cards a page is about.
 * Label: uppercase, tracked. Figure: bold mono, tabular.
 */
export function OverviewCard({
  children,
  className,
  glow = 'soft',
}: {
  children: React.ReactNode;
  className?: string;
  glow?: SignalFieldGlow;
}) {
  return (
    <SignalField
      still
      glow={glow}
      variant="card"
      className={cn('flex min-w-0 flex-col gap-3 p-4 sm:p-[22px]', className)}
    >
      {children}
    </SignalField>
  );
}

export function CardChip({ children, lit = false }: { children: React.ReactNode; lit?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] transition-colors duration-[240ms] ease-ds-out [&>svg]:h-[18px] [&>svg]:w-[18px]',
        lit
          ? 'bg-primary/10 text-primary'
          : 'bg-white/5 text-ds-text-secondary group-hover/signal:bg-primary/10 group-hover/signal:text-primary'
      )}
    >
      {children}
    </span>
  );
}

export const CARD_LABEL =
  'text-[11px] font-semibold uppercase leading-snug tracking-[0.12em] text-ds-text-secondary sm:text-xs';

export const CARD_FIGURE =
  'font-mono text-[22px] font-bold leading-[1.1] tracking-[-0.01em] tabular-nums text-ds-text sm:text-[30px]';

export const CARD_FIGURE_BIG =
  'font-mono text-[34px] font-bold leading-[1.05] tracking-[-0.01em] tabular-nums sm:text-[46px]';

export const CARD_META = 'text-[13px] text-ds-text-secondary';

/** Section title inside a card, in the display serif, as on the homepage. */
export const CARD_TITLE =
  'font-display text-[22px] font-medium leading-none tracking-[-0.01em] text-ds-text sm:text-[26px]';

/** "$4,250.00", "+$179.04", "-$0.80". */
export function money(value: number, { signed = false, decimals = 2 } = {}): string {
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (!signed) return `${value < 0 ? '-' : ''}$${abs}`;
  return `${value < 0 ? '-' : '+'}$${abs}`;
}

/** Colour for a signed amount: up, down, or flat. */
export function toneOf(value: number): string {
  if (value > 0) return 'text-ds-value-positive';
  if (value < 0) return 'text-ds-value-negative';
  return 'text-ds-text-muted';
}
