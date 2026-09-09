import type { YieldRisk } from '@/lib/defillama';

/**
 * One risk badge, rendered identically wherever a pool appears.
 *
 * Shared rather than defined twice, because the dashboard widget and the yield
 * table showing the same pool in different colours would be worse than either
 * choice on its own — and because the previous arrangement, where the widget
 * simply omitted the band the table displayed, is exactly what let two
 * High-risk pools render as bare green percentages.
 */

const TONE: Record<YieldRisk, string> = {
  Low: 'border-ds-value-positive/30 bg-ds-value-positive/10 text-ds-value-positive',
  Medium: 'border-ds-value-warning/30 bg-ds-value-warning/10 text-ds-value-warning',
  High: 'border-ds-value-negative/30 bg-ds-value-negative/10 text-ds-value-negative',
};

export function RiskBadge({ risk, className }: { risk: YieldRisk; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-ds-caption font-medium ${TONE[risk]} ${className ?? ''}`}
    >
      {risk}
    </span>
  );
}
