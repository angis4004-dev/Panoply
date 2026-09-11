'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Opens the deposit window when the Overview is reached as /dashboard?deposit=1,
 * which is where the sidebar's Deposit entry points.
 *
 * Its own component so `useSearchParams` can sit inside a Suspense boundary:
 * reading search params in the page itself would opt the whole Overview out of
 * static rendering. It waits for `ready` (the session is known) because the
 * opener checks verification, and then strips the parameter so a refresh does
 * not reopen the window.
 */
export function DepositQueryOpener({ ready, onOpen }: { ready: boolean; onOpen: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const wantsDeposit = params.get('deposit') === '1';

  useEffect(() => {
    if (!ready || !wantsDeposit) return;
    onOpen();
    router.replace('/dashboard', { scroll: false });
  }, [ready, wantsDeposit, onOpen, router]);

  return null;
}
