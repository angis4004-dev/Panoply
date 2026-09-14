import { cn } from '@/lib/utils';

/**
 * The Signal Field: a card lit from within.
 *
 * A warm glow sits behind the top of the card, where the icon or headline is,
 * and a softer light runs along its left and right edges. The two breathe
 * slowly and out of step, so the card feels alive without anything moving
 * across it.
 *
 * It replaced a contour field with a cyan trace. That trace was drawn in an
 * SVG stretched to the card's shape, so on a phone - where a tap fired it - it
 * cut straight through the headline, and the contour lines sat behind the
 * body copy. The rule now is that light stays at the edges and behind the
 * icon: nothing is ever drawn across the words.
 *
 * Cost is deliberate:
 *
 *   - Pure CSS, no state, no listeners, no SVG. This file no longer needs to be
 *     a client component at all.
 *   - Only opacity and transform animate, both compositor-only, so the
 *     breathing never triggers layout or paint of the content above it.
 *   - Hover and keyboard focus brighten the light rather than start anything,
 *     so the response is instant and has nothing to cancel.
 *   - Under prefers-reduced-motion the light is drawn once, still. Rules live
 *     under `.signal-field` in styles/tailwind.css.
 */

export type SignalFieldVariant = 'card' | 'panel' | 'cta';

export function SignalField({
  children,
  className,
  variant = 'card',
  /** Small label revealed on hover or focus, e.g. "3 CHAINS". */
  readout,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: SignalFieldVariant;
  readout?: string;
}) {
  return (
    <div
      data-variant={variant}
      className={cn(
        'signal-field group/signal relative isolate overflow-hidden',
        'transition-[border-color,background-color] duration-base ease-ds-out',
        // A cta has no surface of its own: it sits behind buttons that carry
        // their own opaque fill, so a border here would box them in. Its light
        // reads in the space around and between them instead.
        variant === 'cta'
          ? 'rounded-xl'
          : 'rounded-2xl border border-ds-border bg-ds-surface-raised/60 hover:border-primary/25 focus-within:border-primary/25',
        className
      )}
    >
      {/* aria-hidden: pure light, nothing a screen reader could use. */}
      <div aria-hidden className="signal-field__core" />
      <div aria-hidden className="signal-field__sides" />

      {children}

      {readout && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute right-4 top-4 font-mono text-xs uppercase tracking-[0.08em] text-primary/80',
            'translate-y-[-4px] opacity-0 transition-[opacity,transform] duration-base ease-ds-out',
            'group-hover/signal:translate-y-0 group-hover/signal:opacity-100',
            'group-focus-within/signal:translate-y-0 group-focus-within/signal:opacity-100'
          )}
        >
          {readout}
        </span>
      )}
    </div>
  );
}

/**
 * The 2px headline nudge on hover or focus, as a class rather than a component.
 *
 * Put it on the heading inside a SignalField. Kept separate because which
 * element should move is a per-card decision.
 */
export const signalHeadline =
  'transition-transform duration-base ease-ds-out group-hover/signal:translate-x-[2px] group-focus-within/signal:translate-x-[2px] motion-reduce:transform-none';
