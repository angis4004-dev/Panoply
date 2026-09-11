'use client';

import { useEffect, useState } from 'react';
import {
  EMPTY_DEPOSIT_SUMMARY,
  summariseDeposits,
  type DepositLike,
  type DepositSummary,
} from '@/lib/onboarding-journey';

/**
 * The trader's deposit history, reduced to what the journey needs.
 *
 * Only fetched once `enabled` - an unverified account cannot have deposits,
 * so asking would be a request for an answer already known. `refreshKey`
 * refetches, which the Overview bumps when the deposit window closes so a
 * just-submitted deposit shows as waiting straight away.
 *
 * A failed request resolves to the empty summary rather than an error. The
 * journey then shows "Deposit" as the next step, which is never wrong enough
 * to block anyone, and the deposit window shows the real history when opened.
 *
 * The previous answer stays in place while a refresh is in flight, so the
 * checklist does not blank out and reappear every time the window closes.
 */
export function useDepositSummary(
  enabled: boolean,
  refreshKey: number
): { summary: DepositSummary; loaded: boolean } {
  const [summary, setSummary] = useState<DepositSummary | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/deposits')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: unknown) => {
        if (cancelled) return;
        setSummary(summariseDeposits(Array.isArray(list) ? (list as DepositLike[]) : []));
      })
      .catch(() => {
        if (!cancelled) setSummary(EMPTY_DEPOSIT_SUMMARY);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  if (!enabled) return { summary: EMPTY_DEPOSIT_SUMMARY, loaded: true };
  return { summary: summary ?? EMPTY_DEPOSIT_SUMMARY, loaded: summary !== null };
}
