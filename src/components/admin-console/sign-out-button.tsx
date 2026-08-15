'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

/**
 * Sign out.
 *
 * A POST, not a link. A GET that ends a session can be triggered by any image
 * tag on any page an operator happens to open, and on a console that is a
 * denial-of-service against the person on call.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch('/api/admin/auth/logout', { method: 'POST' });
        } finally {
          // Navigate regardless. If the request failed the cookie may still be
          // live, but leaving the operator staring at a console they believe
          // they have left is worse - the login page will tell them the truth.
          router.replace('/admin/login');
          router.refresh();
        }
      }}
      className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg border border-ds-border px-3 text-ds-caption font-medium text-ds-text-muted transition-colors duration-fast ease-ds-out hover:border-ds-border-strong hover:bg-ds-surface-inset hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
    >
      <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {/* Wrapped so a browser translator cannot strand React with a stale text
          node reference when `busy` flips. The console is English-only, but an
          operator running Chrome in another language still gets the translate
          prompt, and the crash it causes is a blank console. */}
      <span>{busy ? 'Signing out…' : 'Sign out'}</span>
    </button>
  );
}
