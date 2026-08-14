import React from 'react';
import { cn } from '@/lib/utils';

/**
 * The console's shared surfaces, built on the same ds-* tokens as the trader
 * dashboard.
 *
 * Nothing here invents a colour. `bg-ds-surface-raised` is the card the
 * dashboard uses, `text-ds-value-positive` is the green a trader sees on their
 * own P&L, and the cream `primary` is the brand accent from the marketing
 * pages. An operator moving between the two products should recognise the
 * furniture immediately; what changes is the vocabulary on it, not the palette.
 */

export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        // min-w-0 is load-bearing. A grid or flex item defaults to
        // min-width:auto, so a card holding a wide table inherits the table's
        // min-width and stretches past its own track - which turns the
        // table's internal overflow-x into a horizontal scrollbar on the whole
        // page. With this, the card stays inside the column and the scroll
        // happens where it was designed to.
        'min-w-0 rounded-ds-md border border-ds-border bg-ds-surface-raised/60 shadow-sm shadow-black/20',
        className
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ds-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-ds-label font-semibold text-ds-text">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-ds-caption font-normal tracking-normal text-ds-text-muted">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * A headline figure.
 *
 * `tabular-nums` is not decoration: these numbers change under the reader, and
 * proportional digits make the whole row shuffle sideways every time a count
 * ticks over.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'neutral' | 'attention';
}) {
  return (
    <div
      className={cn(
        'rounded-ds-md border bg-ds-surface-raised/60 px-4 py-3 transition-colors duration-fast ease-ds-out',
        tone === 'attention'
          ? 'border-primary/30 bg-primary/[0.06]'
          : 'border-ds-border hover:border-ds-border-strong'
      )}
    >
      <div className="text-ds-caption uppercase text-ds-text-muted">{label}</div>
      <div
        className={cn(
          'mt-1 font-mono text-ds-heading tabular-nums',
          tone === 'attention' ? 'text-primary' : 'text-ds-text'
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-ds-caption font-normal tracking-normal text-ds-text-muted">
          {hint}
        </div>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  neutral: 'border-ds-border-strong bg-ds-surface-inset text-ds-text-secondary',
  positive: 'border-ds-value-positive/30 bg-ds-value-positive/10 text-ds-value-positive',
  warning: 'border-ds-value-warning/30 bg-ds-value-warning/10 text-ds-value-warning',
  danger: 'border-ds-value-negative/30 bg-ds-value-negative/10 text-ds-value-negative',
  brand: 'border-primary/30 bg-primary/12 text-primary',
};

export type Tone = keyof typeof TONE;

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-ds-caption font-medium',
        TONE[tone] ?? TONE.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}

/** Maps the statuses used across the console onto a consistent tone. */
export function statusTone(status: string): Tone {
  switch (status) {
    case 'active':
    case 'approved':
    case 'verified':
      return 'positive';
    case 'pending':
    case 'onboarding':
    case 'flagged':
      return 'warning';
    case 'rejected':
    case 'suspended':
    case 'inactive':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[44rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-ds-border">
            {head.map((cell, index) => (
              <th
                key={`${cell}-${index}`}
                scope="col"
                className="whitespace-nowrap px-2 pb-2 text-ds-caption uppercase text-ds-text-muted"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ds-border/70">{children}</tbody>
      </table>
    </div>
  );
}

/** A table row with the console's hover treatment. */
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <tr className="transition-colors duration-fast ease-ds-out hover:bg-ds-surface-inset/40">
      {children}
    </tr>
  );
}

export function Cell({
  children,
  mono,
  className,
  title,
}: {
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
  /** Tooltip for truncated values - a shortened hash, mostly. */
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn(
        'px-2 py-2.5 align-top text-ds-label font-normal tracking-normal text-ds-text-secondary',
        // Monospace cells hold timestamps, amounts and shortened hashes -
        // values that are already sized to fit. Letting them wrap turns
        // "09 Aug 2026, 09:54" into three lines and triples the height of
        // every row in the table.
        mono && 'whitespace-nowrap font-mono text-ds-caption tabular-nums tracking-normal',
        className
      )}
    >
      {children}
    </td>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-ds-label font-normal tracking-normal text-ds-text-muted">
      {children}
    </p>
  );
}

/** Minor units to a currency string. The console never renders a float balance. */
export function money(minor: number | null | undefined): string {
  const value = (minor ?? 0) / 100;
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function shortHash(value: string, lead = 10, tail = 6): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

export function when(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// --- Form furniture -------------------------------------------------------
//
// Shared so every panel in the console has the same input, the same 44px
// minimum height, and the same focus ring - the one from the trader sign-in
// screen. Buttons written per-panel is how a console ends up with six shades
// of blue.

export const fieldClass =
  'w-full min-h-[40px] rounded-lg border border-ds-border bg-ds-surface-inset px-3 py-2 text-ds-label font-normal tracking-normal text-ds-text placeholder-ds-text-muted transition duration-fast ease-ds-out focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40';

export const labelClass = 'mb-1 block text-ds-caption uppercase text-ds-text-muted';

const BUTTON_BASE =
  'inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg px-3 text-ds-label font-semibold tracking-normal transition duration-fast ease-ds-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface disabled:cursor-not-allowed disabled:opacity-50';

const BUTTON_VARIANTS = {
  // Cream on navy - the brand's own primary, same as every CTA in the app.
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary:
    'border border-ds-border bg-ds-surface-inset text-ds-text hover:border-ds-border-strong hover:bg-ds-surface-overlay',
  ghost: 'text-ds-text-muted hover:bg-ds-surface-inset hover:text-ds-text',
  positive: 'bg-ds-value-positive/15 text-ds-value-positive hover:bg-ds-value-positive/25',
  danger: 'bg-ds-value-negative/15 text-ds-value-negative hover:bg-ds-value-negative/25',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function buttonClass(variant: ButtonVariant = 'secondary', className?: string): string {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className);
}

/** A panel that floats over a table row: the review and edit popovers. */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'space-y-2.5 rounded-ds-md border border-ds-border-strong bg-ds-surface-overlay p-3 shadow-xl shadow-black/40',
        className
      )}
    >
      {children}
    </div>
  );
}

/** An inline note. Used for permission explanations and standing warnings. */
export function Note({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'warning' | 'danger' | 'brand';
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: 'border-ds-border bg-ds-surface-raised/60 text-ds-text-muted',
    warning: 'border-ds-value-warning/30 bg-ds-value-warning/[0.07] text-ds-value-warning',
    danger: 'border-ds-value-negative/30 bg-ds-value-negative/[0.07] text-ds-value-negative',
    brand: 'border-primary/25 bg-primary/[0.06] text-primary',
  };
  return (
    <p
      className={cn(
        'rounded-lg border px-3 py-2 text-ds-caption font-normal leading-relaxed tracking-normal',
        tones[tone],
        className
      )}
    >
      {children}
    </p>
  );
}
